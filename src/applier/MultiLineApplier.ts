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
        // BreadcrumbProvider 生成 barElement
        const barElement = await this.providers[0].generate(context);
        if (barElement) {
            container.appendChild(barElement);
        }
        // AdjacentDocProvider 生成 navElement，追加到容器内部（barElement 之后，中间加 space）
        const navElement = await this.providers[1].generate(context);
        if (navElement) {
            const space = document.createElement("span");
            space.classList.add("protyle-breadcrumb__space", "og-fdb-adjacent-doc-nav-space-before");
            container.appendChild(space);
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
