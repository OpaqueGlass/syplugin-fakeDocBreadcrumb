/**
 * BreadcrumbProvider - 文档面包屑内容生成
 * 对应原 refer.js 中的 generateElement 函数
 * 使用 DOM API 替代 HTML 字符串拼接
 */

import { CONSTANTS } from "@/constants";
import { debugPush, errorPush, warnPush } from "@/logger";
import { getEmojiElement, getEmojiHtmlStr, trimListDocsByPathAPIReturnedDocName } from "@/utils/onlyThisUtil";
import { isValidStr } from "@/utils/commonCheck";
import { isNotebookDocEnabled, isNotebookDoc, getListDocsByPathAPIFilePath } from "@/utils/compatUtils";
import { getDocInfo, listDocsByPathT, getNotebookInfoLocallyF, getHPathById, getNodebookList, createDocWithPath } from "@/syapi";
import { isChildDocExist } from "@/syapi/custom";
import { openRefLinkByAPI } from "@/utils/common";
import { lang } from "@/utils/lang";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { saveMenuInstance, clearMenuInstance, readFromWnd } from "@/worker/menuHelper";
import * as siyuan from "siyuan";
import { BreadcrumbContext } from "./IProvider";

export class BreadcrumbProvider implements IBreadcrumbProvider {
    readonly id = "breadcrumb";

    async generate(context: BreadcrumbContext): Promise<HTMLElement | null> {
        const setting = context.setting;
        const pathObjects = context.pathObjects;
        const protyle = context.protyle;

        const barElement = document.createElement("div");
        barElement.classList.add("protyle-breadcrumb__bar");

        // 折叠隐藏自
        const foldStartAt = setting.showNotebook ? setting.foldedFrontShow : setting.foldedFrontShow + 1;
        // 折叠隐藏结束于
        const foldEndAt = pathObjects.length - setting.foldedEndShow - 1;

        // 不可点击的根节点层级
        if (setting.showRoot) {
            barElement.appendChild(this.createRootItem(pathObjects));
            barElement.appendChild(this.createArrow("ROOT", "", pathObjects[0]?.box, "", ""));
        }

        let countDebug = 0;
        for (let i = 0; i < pathObjects.length; i++) {
            countDebug++;
            if (countDebug > 200) {
                throw new Error(">_<出现死循环");
            }

            // 层级过深时，对中间内容加以限制
            if (pathObjects.length > 5 && i >= foldStartAt && i <= foldEndAt) {
                this.createFoldedItem(pathObjects, foldStartAt, foldEndAt, barElement);
                i = foldEndAt;
                if (i < 0) i = 0;
                continue;
            }

            const onePathObject = pathObjects[i];
            if ((setting.showNotebook && i === 0) || i !== 0) {
                barElement.appendChild(this.createBreadcrumbItem(onePathObject, pathObjects[i + 1]?.id, setting));
            }

            // 最后一个文档、且不含子文档跳出判断
            if (i === pathObjects.length - 1) {
                const hasChild = await this.checkChildDocExist(onePathObject, protyle);
                if (!hasChild) {
                    continue;
                }
            }

            barElement.appendChild(this.createArrow(
                onePathObject.type,
                onePathObject.id,
                onePathObject.box,
                onePathObject.path,
                pathObjects[i + 1]?.id
            ));
        }

        return barElement;
    }

    /** 创建根节点项 */
    private createRootItem(pathObjects: IPathObject[]): HTMLElement {
        const item = document.createElement("span");
        // 根节点不可点击：去掉 fake-breadcrumb-click，改用 og-fake-doc-breadcrumb-root
        // og-fdb-not-clickable 用于统一标记不可点击项（CSS 去除 hover / pointer 态）
        item.className = "protyle-breadcrumb__item og-fake-doc-breadcrumb-root og-fdb-not-clickable";
        item.setAttribute("data-menu", "true");
        item.setAttribute("data-og-doc-node-id", "");
        item.setAttribute("data-og-type", "ROOT");
        item.setAttribute("data-node-names", "[]");
        item.setAttribute("data-next-id", pathObjects[0]?.box ?? "");
        item.setAttribute("data-og-path", "");
        item.setAttribute("data-og-box", "");

        const textSpan = document.createElement("span");
        textSpan.className = "protyle-breadcrumb__text";
        // 显示为 / 且不提供点击提示（根不可点击）
        textSpan.setAttribute("title", "");
        textSpan.textContent = "/ ";
        item.appendChild(textSpan);
        return item;
    }

    /** 创建面包屑文档/笔记本项 */
    private createBreadcrumbItem(pathObject: IPathObject, nextId: string, setting: any): HTMLElement {
        const item = document.createElement("span");
        // 笔记本项在「禁用笔记本文档」设置下不可点击
        const clickable = !(pathObject.type === "NOTEBOOK" && !isNotebookDocEnabled());
        // 笔记本项在「禁用笔记本文档」设置下不可点击，统一加 og-fdb-not-clickable 标记
        item.className = "protyle-breadcrumb__item" + (clickable ? " fake-breadcrumb-click" : " og-fdb-not-clickable");
        item.setAttribute("data-og-doc-node-id", pathObject.id);
        item.setAttribute("data-og-type", pathObject.type);
        item.setAttribute("data-node-names", JSON.stringify([pathObject.name]));
        item.setAttribute("data-next-id", nextId ?? "");
        item.setAttribute("data-og-path", pathObject.path);
        item.setAttribute("data-og-box", pathObject.box);

        // 浮窗支持
        if (setting.allowFloatWindow && pathObject.type === "FILE") {
            item.setAttribute("data-type", "block-ref");
            item.setAttribute("data-subtype", "d");
            item.setAttribute("data-id", pathObject.id);
        }

        // emoji 图标
        const iconElement = getEmojiElement(
            pathObject.icon,
            pathObject.subFileCount !== 0,
            "og-fdb-bread-emojitext",
            "og-fdb-bread-emojipic",
            setting.icon
        );
        if (iconElement) {
            item.appendChild(iconElement);
        }

        // 文本
        const textSpan = document.createElement("span");
        textSpan.className = "protyle-breadcrumb__text";
        textSpan.setAttribute("title", pathObject.name);
        textSpan.textContent = pathObject.name;
        item.appendChild(textSpan);

        return item;
    }

    /** 创建折叠项 */
    private createFoldedItem(pathObjects: IPathObject[], foldStartAt: number, foldEndAt: number, barElement: HTMLElement): void {
        const setting = getReadOnlyGSettings();
        let hidedIds: string[] = [];
        let hidedNames: string[] = [];
        let hideFrom = foldStartAt;

        // 过滤笔记本，因为笔记本不可点击
        if (hideFrom <= 0) {
            if (isNotebookDocEnabled()) {
                hideFrom = 0;
            } else {
                hideFrom = 1;
            }
        }

        for (let j = hideFrom; j <= foldEndAt; j++) {
            hidedIds.push(pathObjects[j].id);
            hidedNames.push(pathObjects[j].name);
        }

        const item = document.createElement("span");
        item.className = "protyle-breadcrumb__item fake-breadcrumb-click";
        item.setAttribute("data-og-doc-node-id", JSON.stringify(hidedIds).replace(/"/g, "'"));
        item.setAttribute("data-og-type", "...");
        item.setAttribute("data-node-names", JSON.stringify(hidedNames).replace(/"/g, "'"));
        item.setAttribute("data-next-id", "");
        item.setAttribute("data-og-path", "");
        item.setAttribute("data-og-box", "");

        const textSpan = document.createElement("span");
        textSpan.className = "protyle-breadcrumb__text";
        textSpan.setAttribute("title", "···");
        textSpan.textContent = "···";
        item.appendChild(textSpan);
        barElement.appendChild(item);

        // 折叠后的箭头
        barElement.appendChild(this.createArrow(
            "FILE",
            pathObjects[foldEndAt].id,
            pathObjects[foldEndAt].box,
            pathObjects[foldEndAt].path,
            pathObjects[foldEndAt + 1]?.id
        ));
    }

    /** 创建箭头分隔符 */
    private createArrow(type: string, parentId: string, box: string, path: string, nextId: string): HTMLElement {
        const setting = getReadOnlyGSettings();
        const arrowSpan = document.createElement("span");
        arrowSpan.className = CONSTANTS.ARROW_SPAN_NAME;
        arrowSpan.setAttribute("data-og-type", type);
        arrowSpan.setAttribute("data-parent-id", parentId);
        arrowSpan.setAttribute("data-next-id", nextId ?? "");
        arrowSpan.setAttribute("data-og-path", path);
        arrowSpan.setAttribute("data-og-box", box);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", setting.usePluginArrow ? CONSTANTS.ARROW_CLASS_NAME : "protyle-breadcrumb__arrow");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#iconRight");
        svg.appendChild(use);
        arrowSpan.appendChild(svg);

        return arrowSpan;
    }

    /** 检查文档是否有子文档 */
    private async checkChildDocExist(pathObject: IPathObject, protyle: any): Promise<boolean> {
        try {
            const childDocs = await listDocsByPathT({
                path: pathObject.path,
                notebook: pathObject.box,
                maxListCount: 3,
            });
            return childDocs && childDocs.length > 0;
        } catch (err) {
            errorPush("检查子文档时出错", err);
            return false;
        }
    }

    bindEvents(container: HTMLElement, context: BreadcrumbContext): void {
        const protyleElem = context.protyleElement;

        // 点击 FILE 类型
        container.querySelectorAll(`.fake-breadcrumb-click[data-og-type="FILE"]`).forEach((elem) => {
            elem.addEventListener("mouseup", (event) => this.clickBreadcrumbItemAgent("FILE", protyleElem, event as MouseEvent));
        });
        // 点击 NOTEBOOK 类型（仅当启用笔记本文档时绑定）
        if (isNotebookDocEnabled()) {
            container.querySelectorAll(`.fake-breadcrumb-click[data-og-type="NOTEBOOK"]`).forEach((elem) => {
                elem.addEventListener("mouseup", (event) => this.clickBreadcrumbItemAgent("NOTEBOOK", protyleElem, event as MouseEvent));
            });
        }
        // 点击 ROOT 类型
        // container.querySelectorAll(`.fake-breadcrumb-click[data-og-type="ROOT"]`).forEach((elem) => {
        //     elem.addEventListener("mouseup", (event) => this.clickBreadcrumbItemAgent("ROOT", protyleElem, event));
        // });
        // 点击折叠区域
        container.querySelectorAll(`.fake-breadcrumb-click[data-og-type="..."]`).forEach((elem) => {
            elem.addEventListener("click", (event) => this.openHideMenu(protyleElem, event));
        });
        // 点击箭头（常规）
        container.querySelectorAll(`.${CONSTANTS.ARROW_SPAN_NAME}[data-og-type="FILE"], .${CONSTANTS.ARROW_SPAN_NAME}[data-og-type="NOTEBOOK"], .${CONSTANTS.ARROW_SPAN_NAME}[data-og-type="ROOT"]`).forEach((elem) => {
            elem.addEventListener("click", (event) => this.openRelativeMenu(protyleElem, event));
        });
        // 滚动转换
        container.querySelectorAll(`.protyle-breadcrumb__bar`).forEach((elem) => {
            elem.addEventListener("mousewheel", (event: WheelEvent) => {
                elem.scrollLeft = elem.scrollLeft + event.deltaY;
            }, true);
        });
    }

    /** 面包屑项点击代理 */
    private clickBreadcrumbItemAgent(type: string, protyleElem: HTMLElement, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const setting = getReadOnlyGSettings();
        if (setting.swapClickFunction) {
            if (event.button === 2 && (type === "FILE" || (isNotebookDocEnabled() && type === "NOTEBOOK"))) {
                this.openRefLinkAgent(event);
            } else if (event.button !== 2) {
                this.openRelativeMenu(protyleElem, event);
            }
        } else {
            if (event.button === 2) {
                this.openRelativeMenu(protyleElem, event);
            } else if (type === "FILE" || (isNotebookDocEnabled() && type === "NOTEBOOK")) {
                this.openRefLinkAgent(event);
            }
        }
    }

    /** 打开文档 */
    private openRefLinkAgent(event: MouseEvent): void {
        const setting = getReadOnlyGSettings();
        const currentTarget = event.currentTarget as HTMLElement;
        const docId = currentTarget?.getAttribute("data-og-doc-node-id");
        openRefLinkByAPI({
            mouseEvent: event,
            paramDocId: docId ?? "",
            keyParam: {},
        });
    }

    /** 打开折叠区菜单 */
    private openHideMenu(protyleElem: HTMLElement, event: Event): void {
        const setting = getReadOnlyGSettings();
        const currentTarget = event.currentTarget as HTMLElement;
        const idsStr = currentTarget.getAttribute("data-og-doc-node-id")?.replaceAll("'", '"') ?? "[]";
        const namesStr = currentTarget.getAttribute("data-node-names")?.replaceAll("'", '"') ?? "[]";
        const ids = JSON.parse(idsStr);
        const names = JSON.parse(namesStr);
        const rect = currentTarget.getBoundingClientRect();
        event.stopPropagation();
        event.preventDefault();

        const tempMenu = new siyuan.Menu("og-fdb-hide-menu");
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const name = names[i];
            const trimedName = name.length > setting.nameMaxLength
                ? name.substring(0, setting.nameMaxLength) + "..."
                : name;
            tempMenu.addItem({
                iconHTML: "",
                label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}" data-doc-id="${id}" title="${name}">${trimedName}</span>`,
                click: (htmlElement: HTMLElement, event: MouseEvent) => {
                    const docId = htmlElement.querySelector("[data-doc-id]")?.getAttribute("data-doc-id");
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    openRefLinkByAPI({
                        paramDocId: docId ?? "",
                        keyParam: {
                            ctrlKey: event?.ctrlKey,
                            shiftKey: event?.shiftKey,
                            altKey: event?.altKey,
                            metaKey: event?.metaKey,
                        },
                    });
                },
            });
        }
        tempMenu.open({ x: rect.left, y: rect.bottom, isLeft: false });
    }

    /** 打开相关文档菜单 */
    private async openRelativeMenu(protyleElem: HTMLElement, event: Event): Promise<void> {
        event.stopPropagation();
        event.preventDefault();
        event.stopImmediatePropagation();
        const setting = getReadOnlyGSettings();
        const maxDepth = setting.menuExtendSubDocDepth;
        const currentTarget = event.currentTarget as HTMLElement;
        const id = currentTarget.getAttribute("data-parent-id") ?? currentTarget.getAttribute("data-og-doc-node-id");
        const nextId = currentTarget.getAttribute("data-next-id");
        const thisPath = currentTarget.getAttribute("data-og-path");
        const box = currentTarget.getAttribute("data-og-box");
        const type = currentTarget.getAttribute("data-og-type");
        let rect = currentTarget.getBoundingClientRect();
        if (!currentTarget.classList.contains(CONSTANTS.ARROW_SPAN_NAME) && currentTarget.nextElementSibling) {
            rect = (currentTarget.nextElementSibling as HTMLElement).getBoundingClientRect();
        }

        // ROOT 类型（根节点后的展开箭头）的 data-parent-id 为空，无需 id，直接走笔记本列表分支
        if (type !== "ROOT" && !isValidStr(id)) return;

        // 检查并关闭上一个菜单
        if (clearMenuInstance(id)) {
            // 相同菜单已打开，仅关闭
            return;
        }

        let siblings: any[] = [];
        if (type !== "ROOT") {
            siblings = await listDocsByPathT({
                path: thisPath,
                notebook: box,
                maxListCount: setting.docMaxNum > 0 ? setting.docMaxNum : undefined,
            });
        } else {
            const notebookList = await getNodebookList() ?? [];
            siblings = notebookList.filter((nb: any) => nb.closed === false);
        }
        if (!siblings || siblings.length <= 0) return;

        const tempMenu = new siyuan.Menu("og-fdb-relative-menu");

        // 创建新文档按钮
        if (setting.createDocBtnInMenu && type !== "ROOT") {
            tempMenu.addItem({
                icon: "iconAdd",
                label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}">${window.siyuan.languages.newFile}</span>`,
                click: (htmlElement: HTMLElement, event: MouseEvent) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    this.createAndOpenEmptyDocAt(box, thisPath);
                },
            });
        }

        // 本层级内容
        for (const currSibling of siblings) {
            const docName = trimListDocsByPathAPIReturnedDocName(currSibling.name ?? "");
            const trimedName = docName.length > setting.nameMaxLength
                ? docName.substring(0, setting.nameMaxLength) + "..."
                : docName;
            const isCurrent = nextId === currSibling.id;
            const hasChildren = (currSibling.subFileCount > 0 || type === "ROOT");

            let menuItemObj: any = {
                iconHTML: getEmojiHtmlStr(currSibling.icon, currSibling.subFileCount > 0, "og-fdb-menu-emojitext", "og-fdb-menu-emojipic", true, true, setting.icon),
                label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME} ${isCurrent ? CONSTANTS.MENU_CURRENT_DOC_CLASS_NAME : ""}" data-doc-id="${currSibling.id}" title="${docName}">${trimedName}</span>`,
                accelerator: isCurrent ? "<-" : undefined,
                current: isCurrent,
            };

            if (isValidStr(currSibling.icon) && currSibling.icon.indexOf(".") === -1 && !currSibling.icon.startsWith("api/icon/getDynamicIcon")) {
                menuItemObj.icon = `icon-${currSibling.icon}`;
            }

            // 带有子层级的文档，添加子菜单
            if (hasChildren && maxDepth > 1) {
                menuItemObj.type = "submenu";
                menuItemObj.submenu = [{ label: lang("loading"), disabled: true }];
                menuItemObj.label = `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME} ${isCurrent ? CONSTANTS.MENU_CURRENT_DOC_CLASS_NAME : ""}" data-doc-id="${currSibling.id}" data-has-children="true" data-path="${currSibling.path || '/'}" data-box="${type !== "ROOT" ? box : currSibling.id}" data-loaded="false" title="${docName}">${trimedName}</span>`;
            }

            if (type !== "ROOT" || isNotebookDocEnabled()) {
                menuItemObj.click = (htmlElement: HTMLElement, event: MouseEvent) => {
                    const docId = htmlElement.querySelector("[data-doc-id]")?.getAttribute("data-doc-id");
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    openRefLinkByAPI({
                        paramDocId: docId ?? "",
                        keyParam: {
                            ctrlKey: event?.ctrlKey,
                            shiftKey: event?.shiftKey,
                            altKey: event?.altKey,
                            metaKey: event?.metaKey,
                        },
                    });
                };
            }
            tempMenu.addItem(menuItemObj);
        }

        // 菜单展示位置调整
        if (siblings.length * 30 > (window.innerHeight - rect.bottom) * 0.7) {
            tempMenu.open({ x: rect.right, y: rect.top, isLeft: false });
        } else {
            tempMenu.open({ x: rect.left, y: rect.bottom, isLeft: false });
        }

        setTimeout(() => {
            if (setting.menuKeepCurrentVisible) {
                tempMenu.element?.querySelector('.b3-menu__item--selected')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'nearest',
                });
            }
            // 懒加载
            if (setting.menuExtendSubDocDepth > 1) {
                this.addLazyLoadEventListeners(tempMenu.element, maxDepth, protyleElem);
            }
        }, 3);

        saveMenuInstance(tempMenu, id);
    }

    /** 子菜单懒加载 */
    private async addLazyLoadEventListeners(menuElement: HTMLElement, maxDepth: number, protyleElem: HTMLElement, currentDepth: number = 1): Promise<void> {
        const setting = getReadOnlyGSettings();
        const menuItems = menuElement.querySelectorAll('.b3-menu__item [data-has-children="true"][data-loaded="false"]');

        menuItems.forEach((item) => {
            const menuItemElement = item.closest('.b3-menu__item') as HTMLElement;
            if (!menuItemElement) return;

            menuItemElement.addEventListener('mouseover', async (e: MouseEvent) => {
                const docId = item.getAttribute('data-doc-id');
                const path = item.getAttribute('data-path');
                const box = item.getAttribute('data-box');
                const isLoaded = item.getAttribute('data-loaded') === 'true';

                if (isLoaded || currentDepth >= maxDepth) return;
                item.setAttribute('data-loaded', 'true');

                const submenuContainer = menuItemElement.querySelector('.b3-menu__submenu .b3-menu__items') as HTMLElement;
                if (!submenuContainer) return;
                submenuContainer.innerHTML = '';

                const childDocs = await listDocsByPathT({
                    path: path,
                    notebook: box,
                    maxListCount: setting.docMaxNum > 0 ? setting.docMaxNum : undefined,
                });

                if (!childDocs || childDocs.length === 0) {
                    submenuContainer.innerHTML = `<button class="b3-menu__item" disabled><span class="b3-menu__label">${lang("no_doc")}</span></button>`;
                    return;
                }

                // 新建文档按钮（对齐 refer.js addLazyLoadEventListeners）
                const addItemEl = document.createElement('button');
                addItemEl.className = 'b3-menu__item';
                // icon
                const iconAddEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                iconAddEl.classList.add('b3-menu__icon');
                iconAddEl.innerHTML = `<use xlink:href="#iconAdd"></use>`;
                addItemEl.appendChild(iconAddEl);
                // label
                const addLabelEl = document.createElement('span');
                addLabelEl.className = 'b3-menu__label';
                const addTitleEl = document.createElement('span');
                addTitleEl.className = `${CONSTANTS.MENU_ITEM_CLASS_NAME}`;
                addTitleEl.textContent = window.siyuan.languages.newFile;
                addLabelEl.appendChild(addTitleEl);
                addItemEl.appendChild(addLabelEl);
                submenuContainer.appendChild(addItemEl);
                addItemEl.addEventListener('click', (event: MouseEvent) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    this.createAndOpenEmptyDocAt(box, path);
                });

                for (const childDoc of childDocs) {
                    const docName = trimListDocsByPathAPIReturnedDocName(childDoc.name ?? "");
                    const trimedName = docName.length > setting.nameMaxLength
                        ? docName.substring(0, setting.nameMaxLength) + "..."
                        : docName;

                    const menuItemEl = document.createElement('button');
                    menuItemEl.className = 'b3-menu__item';

                    const labelEl = document.createElement('span');
                    labelEl.className = 'b3-menu__label';
                    const docTitleEl = document.createElement('span');
                    docTitleEl.className = CONSTANTS.MENU_ITEM_CLASS_NAME;
                    docTitleEl.setAttribute('data-doc-id', childDoc.id);
                    docTitleEl.setAttribute('title', docName);
                    docTitleEl.textContent = trimedName;
                    labelEl.appendChild(docTitleEl);
                    menuItemEl.appendChild(labelEl);

                    // icon
                    const iconHTML = getEmojiHtmlStr(childDoc.icon, childDoc.subFileCount > 0, "og-fdb-menu-emojitext", "og-fdb-menu-emojipic", true, true, setting.icon);
                    if (iconHTML) {
                        const iconDiv = document.createElement('div');
                        iconDiv.innerHTML = iconHTML;
                        menuItemEl.insertBefore(iconDiv.firstChild, menuItemEl.firstChild);
                    }

                    if (childDoc.subFileCount > 0 && currentDepth + 1 < maxDepth) {
                        // 对齐 refer.js：使用 --custom 类（SiYuan 据此识别为可展开自定义子菜单项）
                        menuItemEl.classList.add('b3-menu__item--ogfdbcustom');
                        docTitleEl.setAttribute('data-has-children', 'true');
                        docTitleEl.setAttribute('data-path', childDoc.path || '');
                        docTitleEl.setAttribute('data-box', box);
                        docTitleEl.setAttribute('data-loaded', 'false');

                        // 子文档有下级时，追加 ">" 箭头（对齐 refer.js addLazyLoadEventListeners）
                        const svgNS = 'http://www.w3.org/2000/svg';
                        const arrowIcon = document.createElementNS(svgNS, 'svg');
                        arrowIcon.setAttribute('class', 'b3-menu__icon b3-menu__icon--small');
                        const useEl = document.createElementNS(svgNS, 'use');
                        useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#iconRight');
                        arrowIcon.appendChild(useEl);
                        menuItemEl.appendChild(arrowIcon);

                        // 子文档容器（自定义子菜单）
                        const submenu = document.createElement('div');
                        submenu.className = 'b3-menu__submenu';
                        const submenuItems = document.createElement('div');
                        submenuItems.className = 'b3-menu__items';
                        // Loading 占位（对齐 refer.js）
                        const loadingItem = document.createElement('button');
                        loadingItem.className = 'b3-menu__item';
                        loadingItem.disabled = true;
                        loadingItem.innerHTML = '<span class="b3-menu__label">Loading...</span>';
                        submenuItems.appendChild(loadingItem);
                        submenu.appendChild(submenuItems);
                        menuItemEl.appendChild(submenu);
                    }

                    menuItemEl.addEventListener('click', (event: MouseEvent) => {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        openRefLinkByAPI({
                            paramDocId: childDoc.id,
                            keyParam: {
                                ctrlKey: event.ctrlKey,
                                shiftKey: event.shiftKey,
                                altKey: event.altKey,
                                metaKey: event.metaKey,
                            },
                        });
                    });

                    submenuContainer.appendChild(menuItemEl);
                }

                // 递归添加懒加载
                this.addLazyLoadEventListeners(submenuContainer, maxDepth, protyleElem, currentDepth + 1);
            });
        });
    }

    /** 创建并打开空文档（对齐 refer.js createAndOpenEmptyDocAt，含创建后关闭菜单） */
    private async createAndOpenEmptyDocAt(box: string, path: string): Promise<void> {
        try {
            // 生成唯一新文档路径（对齐 refer.js：拼接 NewNodeID + ".sy"）
            const newPath = (path.endsWith(".sy") ? path.substring(0, path.length - 3) + "/" : path)
                + (window as any).Lute.NewNodeID() + ".sy";
            // 调用 /api/filetree/createDoc，标题为本地化"未命名"，listDocTree=true
            const newDocData = await createDocWithPath(box, newPath, window.siyuan.languages.untitled, "", true);
            // 创建并打开文档后，关闭整个相关文档菜单（对齐 refer.js g_relativeMenu.close()）
            const recentMenu = readFromWnd("recentMenu");
            if (recentMenu && recentMenu.menu) {
                recentMenu.menu.close();
            }
            if (newDocData && newDocData.id) {
                openRefLinkByAPI({ paramDocId: newDocData.id });
            }
        } catch (err) {
            errorPush("创建文档失败", err);
        }
    }
}
