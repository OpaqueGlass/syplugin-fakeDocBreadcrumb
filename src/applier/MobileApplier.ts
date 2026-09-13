/**
 * MobileApplier - 移动端应用器
 * 路径按钮插入原生面包屑按钮之前，相邻文档按钮置于 protyle-breadcrumb__plugin 槽位；
 * 路径按钮点击弹出思源原生菜单（底部抽屉）做层级跳转。
 * 页面切换时按钮不销毁重建，仅复用元素并重绑行为与禁用态，避免切换闪烁
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
    /** 复用的路径按钮引用；createContainer 每轮重新查找，protyle 重建后自动失效重建 */
    private pathButton: HTMLButtonElement | null = null;

    protected setContainerClass(container: HTMLElement, context: BreadcrumbContext): void {
        container.classList.add(CONSTANTS.MOBILE_CONTAINER_CLASS);
        container.setAttribute(CONSTANTS.MOBILE_MARKER_ATTR, "true");
        // 仅新建时执行；复用路径不会进入本方法，监听器随元素保留，不会重复绑定
        this.blockTouchPropagation(container);
    }

    /**
     * 容器横向滑动仅用于滚动路径文本，触摸事件停止冒泡，
     * 避免触发思源移动端上层的滑动手势（切换文档/侧栏）
     */
    private blockTouchPropagation(container: HTMLElement): void {
        for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
            container.addEventListener(type, (event) => {
                event.stopPropagation();
            });
        }
    }

    /** 已有按钮则复用，否则新建容器 */
    protected createContainer(context: BreadcrumbContext): HTMLElement {
        const bar = context.protyleElement.querySelector(".protyle-breadcrumb") as HTMLElement | null;
        const existing = bar?.querySelector(
            `.${CONSTANTS.MOBILE_CONTAINER_CLASS}[${CONSTANTS.MOBILE_MARKER_ATTR}]`
        ) as HTMLElement | null;
        if (existing) {
            this.pathButton = existing.querySelector(`.${CONSTANTS.MOBILE_BUTTON_CLASS}`) as HTMLButtonElement | null;
            return existing;
        }
        this.pathButton = null;
        return super.createContainer(context);
    }

    protected async assembleContainer(container: HTMLElement, context: BreadcrumbContext): Promise<void> {
        let button = this.pathButton;
        if (!button || !container.contains(button)) {
            button = document.createElement("button");
            button.type = "button";
            button.className = CONSTANTS.MOBILE_BUTTON_CLASS;
            container.appendChild(button);
            this.pathButton = button;
        }

        button.textContent = this.buildPathText(context);
        // 直接onclick实现覆盖旧的点击处理
        button.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openMobilePathMenu(context);
        };
    }

    /** 复用策略下容器不销毁，旧面包屑清理交由 createContainer/insertAdjacentButtons 处理 */
    protected removeOldBreadcrumb(protyleElement: HTMLElement): void {
        // no-op
    }

    protected insertToDOM(container: HTMLElement, context: BreadcrumbContext): void {
        const bar = context.protyleElement.querySelector(".protyle-breadcrumb") as HTMLElement;
        if (!bar) {
            debugPush("移动端面包屑栏未找到");
            return;
        }

        if (container.parentElement !== bar) {
            bar.prepend(container);
        }

        // 相邻文档数据为异步获取，数据就绪后再同步按钮状态，不阻塞主流程
        this.syncAdjacentButtons(bar, context);
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

    /**
     * 相邻按钮同步进 protyle-breadcrumb__plugin：已有则重绑文档与禁用态，无则创建；
     * 关闭显示时移除。显示由 showAdjacentDocButton 控制；移动端恒为精简模式（无文档名、等宽）
     */
    private async syncAdjacentButtons(bar: HTMLElement, context: BreadcrumbContext): Promise<void> {
        const pluginSlot = bar.querySelector(".protyle-breadcrumb__plugin") as HTMLElement | null;

        if (context.setting.showAdjacentDocButton === CONSTANTS.ADJ_NONE) {
            pluginSlot?.querySelectorAll(`[${CONSTANTS.MOBILE_MARKER_ATTR}][${CONSTANTS.MOBILE_ADJ_DIRECTION_ATTR}]`).forEach((el) => el.remove());
            return;
        }

        const adjProvider = this.providers.find((provider) => provider.id === ADJ_PROVIDER_ID) as AdjacentDocProvider;
        if (!adjProvider || !pluginSlot) {
            return;
        }

        const adjacentDocs = await adjProvider.getAdjacentDocs(context.pathObjects, context.notebookDocFlag, context.setting);

        const prevBtn = this.ensureAdjacentBtn(pluginSlot, "prev");
        const nextBtn = this.ensureAdjacentBtn(pluginSlot, "next");
        this.rebindAdjacentBtn(prevBtn, "prev", adjacentDocs.previousDoc);
        this.rebindAdjacentBtn(nextBtn, "next", adjacentDocs.nextDoc);
    }

    /** 查找槽位内已有的相邻按钮，缺失时创建空骨架（svg 由重绑前已定，无需重建） */
    private ensureAdjacentBtn(pluginSlot: HTMLElement, direction: "prev" | "next"): HTMLButtonElement {
        let button = pluginSlot.querySelector(
            `button[${CONSTANTS.MOBILE_MARKER_ATTR}][${CONSTANTS.MOBILE_ADJ_DIRECTION_ATTR}="${direction}"]`
        ) as HTMLButtonElement | null;
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = `block__icon fn__flex-center ariaLabel ${CONSTANTS.MOBILE_ADJ_BTN_CLASS}`;
            button.setAttribute(CONSTANTS.MOBILE_MARKER_ATTR, "true");
            button.setAttribute(CONSTANTS.MOBILE_ADJ_DIRECTION_ATTR, direction);
            button.setAttribute("aria-label", direction === "prev" ? lang("previous_doc") : lang("next_doc"));

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            const iconId = direction === "prev" ? CONSTANTS.MOBILE_ICON_PREV : CONSTANTS.MOBILE_ICON_NEXT;
            use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${iconId}`);
            svg.appendChild(use);
            button.appendChild(svg);

            pluginSlot.appendChild(button);
        }
        return button;
    }

    /** 重绑目标文档、点击行为与禁用态；onclick 赋值覆盖旧处理器 */
    private rebindAdjacentBtn(button: HTMLButtonElement, direction: "prev" | "next", doc: IFile | null): void {
        if (doc?.id) {
            button.disabled = false;
            button.setAttribute("data-doc-id", doc.id);
            button.onclick = () => {
                openRefLinkByAPI({ paramDocId: doc.id });
            };
        } else {
            // 无相邻文档时禁用占位，保持按钮等宽
            button.disabled = true;
            button.removeAttribute("data-doc-id");
            button.onclick = null;
        }
    }
}
