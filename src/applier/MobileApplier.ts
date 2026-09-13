/**
 * MobileApplier - 移动端应用器
 * 路径按钮插入原生面包屑按钮之前，相邻文档按钮插入原生面包屑按钮之后；
 * 路径按钮点击弹出思源原生菜单（底部抽屉）做层级跳转
 */

import { CONSTANTS } from "@/constants";
import { debugPush } from "@/logger";
import { escapeHTML, getEmojiHtmlStr, resolveNodeType } from "@/utils/onlyThisUtil";
import { openRefLinkByAPI } from "@/utils/common";
import { lang } from "@/utils/lang";
import * as siyuan from "siyuan";
import { AdjacentDocProvider } from "@/provider/AdjacentDocProvider";
import { BreadcrumbApplier } from "./ApplierBase";

const ADJ_PROVIDER_ID = "adjacent-doc";

export class MobileApplier extends BreadcrumbApplier {
    protected setContainerClass(container: HTMLElement, context: BreadcrumbContext): void {
        container.classList.add(CONSTANTS.MOBILE_CONTAINER_CLASS);
        container.setAttribute(CONSTANTS.MOBILE_MARKER_ATTR, "true");
    }

    protected async assembleContainer(container: HTMLElement, context: BreadcrumbContext): Promise<void> {
        const button = document.createElement("button");
        button.type = "button";
        button.className = CONSTANTS.MOBILE_BUTTON_CLASS;
        button.textContent = this.buildPathText(context);

        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            this.openMobilePathMenu(context);
        });
        container.appendChild(button);
    }

    protected insertToDOM(container: HTMLElement, context: BreadcrumbContext): void {
        const bar = context.protyleElement.querySelector(".protyle-breadcrumb") as HTMLElement;
        if (!bar) {
            debugPush("移动端面包屑栏未找到");
            return;
        }

        // 相邻按钮游离于容器之外，与容器一并按标记清理，防止重复插入
        bar.querySelectorAll(`[${CONSTANTS.MOBILE_MARKER_ATTR}]`).forEach((el) => el.remove());

        bar.prepend(container);

        // 相邻文档数据为异步获取，数据就绪后再补插，不阻塞主流程
        this.insertAdjacentButtons(bar, context);
    }

    protected adjustOverflow(container: HTMLElement): void {
        // 移动端为横向滚动布局，基类针对 .protyle-breadcrumb__item 的折行检测不适用
    }

    /** 路径按钮文本：笔记本 + 全部父链 + 当前文档，不设层级上限 */
    private buildPathText(context: BreadcrumbContext): string {
        const setting = context.setting;
        const maxLength = Number(setting.breadcrumbNameMaxLength) || 0;

        return context.pathObjects
            .filter((pathObject, index) => index !== 0 || setting.showNotebook)
            .map((pathObject) => this.trimName(pathObject.name, maxLength))
            .join(" / ");
    }

    private trimName(name: string, maxLength: number): string {
        // breadcrumbNameMaxLength 桌面端单位为 em，此处按字符数截断
        if (maxLength > 0 && name.length > maxLength) {
            return name.substring(0, maxLength) + "...";
        }
        return name;
    }

    /** 菜单为父链平铺列表：笔记本项仅展示，当前文档项禁用并高亮 */
    private openMobilePathMenu(context: BreadcrumbContext): void {
        const setting = context.setting;
        const maxLength = Number(setting.breadcrumbNameMaxLength) || 0;
        const menu = new siyuan.Menu(CONSTANTS.MOBILE_MENU_ID);

        const notebook = context.pathObjects[0];
        if (setting.showNotebook && notebook?.type === "NOTEBOOK") {
            menu.addItem({
                iconHTML: getEmojiHtmlStr({
                    iconString: notebook.icon,
                    nodeType: resolveNodeType(true, notebook.subFileCount),
                    svgClassName: "b3-menu__icon",
                    textClassName: "b3-menu__icon",
                    wrapSvg: false,
                    wrapBlank: true,
                    iconMode: setting.icon,
                }),
                label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}">${escapeHTML(this.trimName(notebook.name, maxLength))}</span>`,
            });
            menu.addSeparator();
        }

        for (const pathObject of context.pathObjects) {
            if (pathObject.type !== "FILE") {
                continue;
            }
            const isCurrent = pathObject.id === context.docId;
            const name = escapeHTML(this.trimName(pathObject.name, maxLength));
            menu.addItem({
                id: `og-breadcrumb-mobile-${pathObject.id}`,
                iconHTML: getEmojiHtmlStr({
                    iconString: pathObject.icon,
                    nodeType: resolveNodeType(false, pathObject.subFileCount),
                    svgClassName: "b3-menu__icon",
                    textClassName: "b3-menu__icon",
                    wrapSvg: false,
                    wrapBlank: true,
                    iconMode: setting.icon,
                }),
                current: isCurrent,
                label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME} ${isCurrent ? CONSTANTS.MENU_CURRENT_DOC_CLASS_NAME : ""}" data-doc-id="${pathObject.id}">${name}</span>`,
                click: () => {
                    if (!isCurrent) {
                        openRefLinkByAPI({ paramDocId: pathObject.id });
                    }
                },
            });
        }
        debugPush("移动端路径菜单", menu);
        menu.fullscreen();
    }

    /** 相邻按钮显示由 showAdjacentDocButton 控制；移动端恒为精简模式（无文档名、等宽） */
    private async insertAdjacentButtons(bar: HTMLElement, context: BreadcrumbContext): Promise<void> {
        if (context.setting.showAdjacentDocButton === CONSTANTS.ADJ_NONE) {
            return;
        }

        const adjProvider = this.providers.find((provider) => provider.id === ADJ_PROVIDER_ID) as AdjacentDocProvider;
        if (!adjProvider) {
            return;
        }

        const adjacentDocs = await adjProvider.getAdjacentDocs(context.pathObjects, context.notebookDocFlag, context.setting);

        const nativeBreadcrumbBtn = bar.querySelector(".protyle-breadcrumb__icon");
        if (!nativeBreadcrumbBtn) {
            debugPush("移动端原生面包屑按钮未找到");
            return;
        }

        nativeBreadcrumbBtn.insertAdjacentElement("afterend", this.createAdjacentIconBtn("next", adjacentDocs.nextDoc));
        nativeBreadcrumbBtn.insertAdjacentElement("afterend", this.createAdjacentIconBtn("prev", adjacentDocs.previousDoc));
    }

    private createAdjacentIconBtn(direction: "prev" | "next", doc: IFile | null): HTMLElement {
        const isPrevious = direction === "prev";
        const button = document.createElement("button");
        button.type = "button";
        button.className = `block__icon fn__flex-center ariaLabel ${CONSTANTS.MOBILE_ADJ_BTN_CLASS}`;
        button.setAttribute(CONSTANTS.MOBILE_MARKER_ATTR, "true");
        button.setAttribute("data-og-adjacent-direction", direction);
        button.setAttribute("aria-label", isPrevious ? lang("previous_doc") : lang("next_doc"));

        if (doc?.id) {
            button.setAttribute("data-doc-id", doc.id);
            button.addEventListener("click", () => {
                openRefLinkByAPI({ paramDocId: doc.id });
            });
        } else {
            button.disabled = true;
        }

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        const iconId = isPrevious ? CONSTANTS.MOBILE_ICON_PREV : CONSTANTS.MOBILE_ICON_NEXT;
        use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${iconId}`);
        svg.appendChild(use);
        button.appendChild(svg);

        return button;
    }
}
