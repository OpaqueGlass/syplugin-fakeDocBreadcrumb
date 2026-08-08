/**
 * MultiLineApplier - 多行面包屑应用器
 * 面包屑独占一行，导航按钮在下方一行
 * 对应原 refer.js setAndApply 中 oneLineBreadcrumb=false 分支
 */

import { debugPush } from "@/logger";
import { BreadcrumbApplier } from "./ApplierBase";

export class MultiLineApplier extends BreadcrumbApplier {
    protected setContainerClass(container: HTMLElement, context: BreadcrumbContext): void {
        container.classList.add("protyle-breadcrumb");
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
            // 中间动态间隔：撑开空白，把 nav 推到最右（替代原 protyle-breadcrumb__space）
            container.appendChild(this.createSpacer());
            container.appendChild(navElement);
        }
    }

    protected insertToDOM(container: HTMLElement, context: BreadcrumbContext): void {
        const protyleElem = context.protyleElement;
        const elem = protyleElem.querySelector(`.protyle-breadcrumb`);
        if (elem) {
            elem.insertAdjacentElement("beforebegin", container);
        } else {
            debugPush("可能是由于焦点不在文档上");
        }
    }
}
