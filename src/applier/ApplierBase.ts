/**
 * BreadcrumbApplier - 应用器基类
 * 负责创建统一容器、调用 Provider 生成内容并装入容器、将容器插入 DOM
 */

import { CONSTANTS } from "@/constants";
import { debugPush } from "@/logger";

export abstract class BreadcrumbApplier {
    protected providers: IBreadcrumbProvider[];

    constructor(providers: IBreadcrumbProvider[]) {
        this.providers = providers;
    }

    /**
     * 应用面包屑到 DOM
     */
    async apply(context: BreadcrumbContext): Promise<void> {
        // 1. 移除旧面包屑
        this.removeOldBreadcrumb(context.protyleElement);
        // 2. 创建统一容器
        const container = this.createContainer(context);
        // 3. 调用各 Provider 生成内容并装入容器
        await this.assembleContainer(container, context);
        // 4. 插入到 DOM
        this.insertToDOM(container, context);
        // 5. 宽度溢出调整
        this.adjustOverflow(container);
        // 6. 绑定事件
        this.bindProviderEvents(container, context);
    }

    /** 创建统一容器 div */
    protected createContainer(context: BreadcrumbContext): HTMLElement {
        const container = document.createElement("div");
        container.classList.add(CONSTANTS.CONTAINER_CLASS_NAME);
        this.setContainerClass(container, context);
        return container;
    }

    /** 创建动态间隔元素：占满 bar 与 nav 之间的剩余空间，把 nav 推到最右 */
    protected createSpacer(): HTMLElement {
        const spacer = document.createElement("div");
        spacer.className = "og-fake-doc-breadcrumb-spacer";
        return spacer;
    }

    /** 移除旧面包屑 */
    protected removeOldBreadcrumb(protyleElement: HTMLElement): void {
        const oldElem = protyleElement.querySelector(`.${CONSTANTS.CONTAINER_CLASS_NAME}`);
        protyleElement.querySelector(`.og-breadcrumb-oneline-divider`)?.remove();
        if (oldElem) {
            oldElem.remove();
            debugPush("移除原有面包屑成功");
        }
    }

    /** 宽度溢出调整 */
    protected adjustOverflow(container: HTMLElement): void {
        let isAdjustFinished = false;
        const itemElements = container.querySelectorAll(".protyle-breadcrumb__item ");
        while (container.scrollHeight > 30 && !isAdjustFinished && itemElements.length > 2) {
            [].find.call(itemElements, ((item: HTMLElement, index: number) => {
                if (index > 0) {
                    if (!item.classList.contains("og-fake-doc-breadcrumb-ellipsis")) {
                        item.classList.add("og-fake-doc-breadcrumb-ellipsis");
                        return true;
                    }
                    if (index === itemElements.length - 1 && item.classList.contains("og-fake-doc-breadcrumb-ellipsis")) {
                        isAdjustFinished = true;
                    }
                }
            }));
        }
        const firstChild = container.firstChild as HTMLElement;
        if (firstChild) {
            firstChild.classList.add("protyle-breadcrumb__bar--nowrap");
        }
    }

    /** 绑定所有 Provider 的事件 */
    protected bindProviderEvents(container: HTMLElement, context: BreadcrumbContext): void {
        this.providers.forEach((p) => p.bindEvents(container, context));
    }

    /** 子类实现：设置容器额外 class */
    protected abstract setContainerClass(container: HTMLElement, context: BreadcrumbContext): void;

    /** 子类实现：调用各 Provider 生成内容并装入容器 */
    protected abstract assembleContainer(container: HTMLElement, context: BreadcrumbContext): Promise<void>;

    /** 子类实现：插入到 DOM 的具体位置 */
    protected abstract insertToDOM(container: HTMLElement, context: BreadcrumbContext): void;
}
