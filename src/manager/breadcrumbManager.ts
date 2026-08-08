/**
 * BreadcrumbManager - 面包屑总管理器
 * 对应原 refer.js 中的 main() 函数
 * 负责编排：互斥锁 → 文档详情获取 → 路径解析 → Provider-Applier 协调
 */

import { CONSTANTS } from "@/constants";
import { debugPush, errorPush, logPush, warnPush, infoPush } from "@/logger";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { isValidStr } from "@/utils/commonCheck";
import { isNotebookDoc, isNotebookDocEnabled, getListDocsByPathAPIFilePath } from "@/utils/compatUtils";
import { getProtyleInfo } from "@/utils/onlyThisUtil";
import { getNotebookInfoLocallyF, getHPathById, getDocInfo, isMobile, getDocOutlineAPI } from "@/syapi";
import { BreadcrumbProvider } from "@/provider/BreadcrumbProvider";
import { AdjacentDocProvider } from "@/provider/AdjacentDocProvider";
import { ApplierFactory } from "@/applier/ApplierFactory";
import { sleep, openRefLinkByAPI } from "@/utils/common";
import * as siyuan from "siyuan";

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
        if (isMobile()) {
            debugPush("插件停止支持移动端");
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
        const barElement = protyleElement.querySelector(".protyle-breadcrumb__bar") as HTMLElement;
        if (!barElement) return;
        if (barElement.dataset.ogFdbAddedEl) return; // 已绑定
        barElement.dataset.ogFdbAddedEl = "true";

        // 为块面包屑箭头添加点击监听
        const arrows = barElement.querySelectorAll(".protyle-breadcrumb__arrow");
        arrows.forEach((arrow) => {
            arrow.addEventListener("click", async (event) => {
                event.stopPropagation();
                event.preventDefault();
                // 基于文档大纲展示标题菜单
                await this.openBlockBreadcrumbMenu(docId, protyle, event);
            });
        });
    }

    /** 块面包屑大纲菜单（简化版） */
    private async openBlockBreadcrumbMenu(docId: string, protyle: any, event: Event): Promise<void> {
        const outline = await getDocOutlineAPI(docId);
        if (!outline || outline.length === 0) return;

        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const menu = new siyuan.Menu("og-fdb-block-breadcrumb-menu");

        const buildMenuItems = (items: any[], depth: number = 0) => {
            for (const item of items) {
                const indent = "  ".repeat(depth);
                menu.addItem({
                    label: `${indent}${item.name}`,
                    click: (htmlElement: HTMLElement, event: MouseEvent) => {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        if (item.id) {
                            openRefLinkByAPI({ paramDocId: item.id });
                        }
                    },
                });
                if (item.children && item.children.length > 0) {
                    buildMenuItems(item.children, depth + 1);
                }
            }
        };
        buildMenuItems(outline);
        menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
    }
}
