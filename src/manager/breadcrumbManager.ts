/**
 * BreadcrumbManager - 面包屑总管理器
 * 对应原 refer.js 中的 main() 函数
 * 负责编排：互斥锁 → 文档详情获取 → 路径解析 → Provider-Applier 协调
 */

import { CONSTANTS } from "@/constants";
import { debugPush, errorPush, logPush, warnPush } from "@/logger";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { isValidStr } from "@/utils/commonCheck";
import { isNotebookDoc, isNotebookDocEnabled, getListDocsByPathAPIFilePath } from "@/utils/compatUtils";
import { escapeHTML, stripHTML } from "@/utils/onlyThisUtil";
import { getNotebookInfoLocallyF, getHPathById, getDocInfo, isMobile, getDocOutlineAPI, getCurrentDocIdF } from "@/syapi";
import { BreadcrumbProvider } from "@/provider/BreadcrumbProvider";
import { AdjacentDocProvider } from "@/provider/AdjacentDocProvider";
import { ApplierFactory } from "@/applier/ApplierFactory";
import { clearMenuInstance, saveMenuInstance } from "@/worker/menuHelper";
import { getPluginInstance } from "@/utils/getInstance";
import * as siyuan from "siyuan";
import { showPluginMessage } from "@/utils/common";
import { lang } from "@/utils/lang";

export class BreadcrumbManager {
    private providers: IBreadcrumbProvider[];
    private docIdMutex: Record<string, number> = {};
    private adjacentDocProvider: AdjacentDocProvider;

    constructor() {
        this.adjacentDocProvider = new AdjacentDocProvider();
        this.providers = [
            new BreadcrumbProvider(),
            this.adjacentDocProvider,
        ];
    }

    /**
     * 主流程（原 main 函数）
     */
    async processProtyle(protyle: any): Promise<void> {
        if (isMobile() && !getReadOnlyGSettings().applyForMobileSystem) {
            debugPush("移动端未启用，插件停止支持移动端");
            return;
        }

        const uuid = protyle?.element?.getAttribute("data-id") ?? protyle?.block?.rootID;
        if (this.docIdMutex[uuid] != null && this.docIdMutex[uuid] > 0) {
            debugPush("发现已有main正在运行，已停止");
            return;
        }

        try {
            if (this.docIdMutex[uuid]) {
                this.docIdMutex[uuid]++;
            } else {
                this.docIdMutex[uuid] = 1;
            }

            const docId = protyle.block.rootID;
            if (!isValidStr(docId)) {
                debugPush("获取文档id失败");
                return;
            }

            const setting = getReadOnlyGSettings();

            const docDetail = await this.getCurrentDocDetail(docId, protyle);
            debugPush("DETAIL", docDetail);
            if (!docDetail || !isValidStr(docDetail.path)) {
                logPush("数据库中找不到当前打开的文档");
                return;
            }

            // 检查重复插入
            if (!setting.timelyUpdate && window.top.document.querySelector(
                `.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .${CONSTANTS.CONTAINER_CLASS_NAME}`
            )) {
                debugPush("重复插入，操作停止");
                return;
            }

            // 解析路径
            const pathObjects = await this.parseDocPath(docDetail);
            debugPush("OBJECT", pathObjects);

            // 判断笔记本文档
            const notebookDocFlag = isNotebookDoc(protyle.path, protyle.notebookId);

            // 构建 context
            const context: BreadcrumbContext = {
                docId,
                protyle,
                protyleElement: protyle.element,
                pathObjects,
                notebookDocFlag,
                setting,
            };

            // 判断是否为抽认卡页面
            const isCardPage = protyle.element.classList.contains("card__block");

            // 选择 Applier 并执行
            const applier = ApplierFactory.create(setting, this.providers, isCardPage);
            await applier.apply(context);

            debugPush("重写面包屑成功");
        } catch (err) {
            warnPush(err);
            errorPush(err);
        } finally {
            this.docIdMutex[uuid]--;
        }
    }

    /**
     * 获取当前文档详情
     * 对应原 refer.js getCurrentDocDetail
     */
    private async getCurrentDocDetail(docId: string, protyle: any): Promise<any> {
        const result = {
            path: protyle.path,
            hpath: await getHPathById(docId),
            box: protyle.notebookId,
            docId: protyle.block.rootID,
        };
        return result;
    }

    /**
     * 解析文档路径
     * 对应原 refer.js parseDocPath
     */
    private async parseDocPath(docDetail: any): Promise<IPathObject[]> {
        const setting = getReadOnlyGSettings();
        const docPath = getListDocsByPathAPIFilePath(docDetail.path, docDetail.box);
        const pathArray = docPath.substring(0, docPath.length - 3).split("/");
        const hpath = docDetail.hpath ?? await getHPathById(docDetail.docId);
        const hpathArray = hpath.split("/");

        const resultArray: IPathObject[] = [];
        const notebooks = getNotebookInfoLocallyF() as INotebook[];
        let box: INotebook | undefined;
        for (const notebook of notebooks) {
            if (notebook.id === docDetail.box) {
                box = notebook;
                break;
            }
        }
        if (!box) {
            warnPush("未找到对应笔记本", docDetail.box);
            return resultArray;
        }

        // 笔记本层级
        resultArray.push({
            name: box.name,
            id: box.id,
            icon: box.icon,
            box: box.id,
            path: "/",
            type: "NOTEBOOK",
            subFileCount: -1,
        });

        // 获取图标
        let icons: string[] = [""];
        let subFileCounts: number[] = [-1];
        if (setting.icon !== CONSTANTS.ICON_NONE) {
            const promiseList: Promise<any>[] = [];
            for (let i = 1; i < pathArray.length; i++) {
                promiseList.push(getDocInfo(pathArray[i]));
            }
            const iconResults = await Promise.all(promiseList);
            for (const result of iconResults) {
                if (result) {
                    icons.push(result.icon ?? "");
                    subFileCounts.push(result.subFileCount ?? -1);
                } else {
                    icons.push("");
                    subFileCounts.push(-1);
                }
            }
        }

        // 文档层级
        let tempPath = "";
        for (let i = 1; i < pathArray.length; i++) {
            const pathObject: IPathObject = {
                name: hpathArray[i] ?? "",
                id: pathArray[i],
                icon: "",
                path: `${tempPath}/${pathArray[i]}.sy`,
                box: box.id,
                type: "FILE",
                subFileCount: -1,
            };
            if (setting.icon !== CONSTANTS.ICON_NONE) {
                pathObject.icon = icons[i] ?? "";
                pathObject.subFileCount = subFileCounts[i] ?? -1;
            }
            tempPath += "/" + pathArray[i];
            resultArray.push(pathObject);
        }

        return resultArray;
    }

    /**
     * 刷新所有已打开文档的面包屑
     * 对应原 refer.js eventBusHandler 中的刷新逻辑
     */
    async refreshAllOpenDocs(): Promise<void> {
        try {
            debugPush("检查刷新中（由重命名、移动或删除触发）");
            const allEditor = siyuan.getAllEditor();
            const ids = this.getAllShowingDocId();
            if (ids && ids.length > 0) {
                for (const editor of allEditor) {
                    if (ids.includes(editor.protyle.block.rootID)) {
                        debugPush("由重命名、移动或删除触发");
                        await this.processProtyle(editor.protyle);
                    }
                }
            }
            // 清除相邻文档缓存
            this.adjacentDocProvider.clearCache();
        } catch (err) {
            errorPush(err);
        }
    }

    private getAllShowingDocId(): string[] {
        if (isMobile()) {
            return [getCurrentDocIdF()];
        } 
        const elemList = window.document.querySelectorAll("[data-type=wnd] .protyle.fn__flex-1:not(.fn__none) .protyle-background");
        const result = Array.from(elemList).map((elem) => elem.getAttribute("data-node-id"));
        return result.filter((id): id is string => isValidStr(id));
    }

    /**
     * 添加块面包屑菜单监听
     * 对应原 refer.js addBlockBdMenuListener
     * TODO: 后续可提取为独立的 BlockBreadcrumbMenu 类
     */
    addBlockBdMenuListener(protyleElement: HTMLElement, docId: string, protyle: any): void {
        // 限制范围到 SiYuan 原生块面包屑条（避免影响插件插入的文档面包屑）
        const breadcrumbBar = protyleElement.querySelector(".protyle-breadcrumb > .protyle-breadcrumb__bar") as HTMLElement;
        if (!breadcrumbBar) return;
        if (breadcrumbBar.dataset["ogFdbAddedEl"]) return; // 已绑定
        breadcrumbBar.dataset["ogFdbAddedEl"] = "true";

        breadcrumbBar.addEventListener("click", async (event: MouseEvent) => {
            // 使用 .closest() 判断点击的是否是箭头或其内部元素
            const arrowElement = (event.target as HTMLElement).closest(".protyle-breadcrumb__arrow") as HTMLElement;
            if (!arrowElement) {
                return;
            }
            // 获取箭头左侧的面包屑项目
            const precedingItem = arrowElement.previousElementSibling as HTMLElement;
            if (!precedingItem || !precedingItem.classList.contains("protyle-breadcrumb__item")) {
                return;
            }
            const afterItem = arrowElement.nextElementSibling as HTMLElement;
            let nextNodeId = "";
            if (afterItem && precedingItem.classList.contains("protyle-breadcrumb__item")) {
                nextNodeId = afterItem.dataset.nodeId ?? "";
            }
            // 提取 Node ID 和图标信息
            const nodeId = precedingItem.dataset.nodeId ?? "";
            const iconUseElement = precedingItem.querySelector("svg.popover__block use") as SVGUseElement;

            if (!nodeId || !iconUseElement) {
                return;
            }
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
            const iconHref = iconUseElement.getAttributeNS("http://www.w3.org/1999/xlink", "href");

            const menuId = "bid_" + nodeId;
            clearMenuInstance(menuId);
            await this.openBlockBreadcrumbMenu(docId, protyle, arrowElement, nodeId, iconHref ?? "", nextNodeId);
        });
    }

    /**
     * 块面包屑大纲菜单
     * 对应原 refer.js addBlockBdMenuListener 中基于大纲构建菜单的部分
     * 根据图标类型决定菜单内容：#iconFile 显示顶级标题，#iconHx 显示该标题的直接子标题
     */
    private async openBlockBreadcrumbMenu(docId: string, protyle: any, arrowElement: HTMLElement, nodeId: string, iconHref: string, nextNodeId: string): Promise<void> {
        const setting = getReadOnlyGSettings();
        try {
            // 获取文档大纲
            const outlineData = await getDocOutlineAPI(docId);
            if (outlineData == null) {
                showPluginMessage(lang("nothingToDisplay"));
                return;
            }

            // 根据图标类型来决定菜单内容
            let menuItems: any[] = [];
            if (iconHref === "#iconFile") {
                // 如果是文档图标，显示所有顶级标题
                menuItems = outlineData.filter((item: any) => item.depth === 0);
            } else if (iconHref.startsWith("#iconH")) {
                // 如果是标题图标 (H1-H6)，显示其下的直接子标题
                const findHeadingById = (items: any[], targetId: string): any => {
                    for (const item of items) {
                        if (item.id === targetId) {
                            return item;
                        }
                        if (item.blocks && item.blocks.length > 0) {
                            const found = findHeadingById(item.blocks, targetId);
                            if (found) return found;
                        }
                        if (item.children && item.children.length > 0) {
                            const found = findHeadingById(item.children, targetId);
                            if (found) return found;
                        }
                    }
                    return null;
                };
                const parentHeading = findHeadingById(outlineData, nodeId);
                if (parentHeading) {
                    menuItems = parentHeading.blocks || parentHeading.children || [];
                }
            } else {
                showPluginMessage(lang("nothingToDisplay"));
                return;
            }

            // 递归构建菜单项的函数
            const buildMenuItems = (items: any[]): any[] => {
                return items.map((item: any) => {
                    const fullName = escapeHTML(stripHTML(item.name || item.content || "N/A"));
                    const trimedName = fullName.length > setting.nameMaxLength
                        ? fullName.substring(0, setting.nameMaxLength) + "..."
                        : fullName;
                    const menuItem: any = {
                        id: item.id,
                        label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}" data-og-block-node-id="${item.id}" title="${fullName}">${trimedName}</span>`,
                        current: nextNodeId === item.id,
                        icon: "icon" + (item.subType ?? "").toUpperCase(),
                        click: (htmlElement: HTMLElement, evt: MouseEvent) => {
                            const blocId = htmlElement.querySelector(".og-fake-doc-breadcrumb-menu-item-container")?.getAttribute("data-og-block-node-id");
                            evt.preventDefault();
                            evt.stopImmediatePropagation();
                            evt.stopPropagation();
                            if (blocId) {
                                siyuan.openTab({
                                    app: getPluginInstance().app,
                                    doc: {
                                        id: blocId,
                                        action: ["cb-get-focus", "cb-get-all"],
                                        keepCursor: true,
                                    },
                                    afterOpen: () => {
                                        // 更新 breadcrumb
                                        protyle?.breadcrumb?.render(protyle);
                                    }
                                });
                            }
                        }
                    };

                    const childItems = item.blocks || item.children;
                    if (childItems && childItems.length > 0) {
                        menuItem.type = "submenu";
                        menuItem.submenu = buildMenuItems(childItems);
                    }
                    return menuItem;
                });
            };

            // 打开菜单
            const rect = arrowElement.getBoundingClientRect();
            if (menuItems.length > 0) {
                const tempMenu = new siyuan.Menu("og-fdb-relative-menu");
                buildMenuItems(menuItems).forEach((menuItem) => {
                    tempMenu.addItem(menuItem);
                });
                // 菜单展示位置调整
                if (menuItems.length * 30 > (window.innerHeight - rect.bottom) * 0.7) {
                    tempMenu.open({ x: rect.right, y: rect.top, isLeft: false });
                } else {
                    tempMenu.open({ x: rect.left, y: rect.bottom, isLeft: false });
                }

                saveMenuInstance(tempMenu, "bid_" + nodeId);
            } else {
                showPluginMessage(lang("nothingToDisplay"));
            }
        } catch (error) {
            errorPush("获取或处理大纲数据时出错:", error);
        }
    }
}
