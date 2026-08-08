/**
 * SingleLineApplier - 单行面包屑应用器
 * 面包屑和导航按钮在同一行
 * 对应原 refer.js setAndApply 中 oneLineBreadcrumb=true 分支
 */

import { debugPush } from "@/logger";
import { BreadcrumbApplier } from "./ApplierBase";

export class SingleLineApplier extends BreadcrumbApplier {
    protected setContainerClass(container: HTMLElement, context: BreadcrumbContext): void {
        container.classList.add("og-breadcrumb-oneline");
    }

    protected async assembleContainer(container: HTMLElement, context: BreadcrumbContext): Promise<void> {
        // BreadcrumbProvider 生成 barElement（面包屑，靠左）
        const barElement = await this.providers[0].generate(context);
        if (barElement) {
            container.appendChild(barElement);
        }
        // AdjacentDocProvider 生成 navElement（上一篇/下一篇，靠右）
        const navElement = await this.providers[1].generate(context);
        if (navElement) {
            // 中间动态间隔：撑开空白，把 nav 推到最右
            container.appendChild(this.createSpacer());
            container.appendChild(navElement);
        }
    }

    protected insertToDOM(container: HTMLElement, context: BreadcrumbContext): void {
        const protyleElem = context.protyleElement;
        const elem = protyleElem.querySelector(`.protyle-breadcrumb__bar`);
        if (elem) {
            elem.insertAdjacentElement("beforebegin", container);
            const divider = document.createElement("div");
            divider.classList.add("og-breadcrumb-oneline-divider");
            container.insertAdjacentElement("afterend", divider);
        } else {
            debugPush("可能是由于没有焦点不再文档上");
        }
    }
}
