/**
 * AdjacentDocProvider - 上一篇/下一篇导航内容生成
 * 对应原 refer.js 中的 generateAdjacentDocNav / createAdjacentDocButton / getAdjacentDocs 等
 */

import { CONSTANTS } from "@/constants";
import { debugPush, errorPush } from "@/logger";
import { trimListDocsByPathAPIReturnedDocName } from "@/utils/onlyThisUtil";
import { isValidStr } from "@/utils/commonCheck";
import { listDocsByPathT, getNodebookList } from "@/syapi";
import { openRefLinkByAPI } from "@/utils/common";
import { lang } from "@/utils/lang";
import { getReadOnlyGSettings } from "@/manager/settingManager";

export class AdjacentDocProvider implements IBreadcrumbProvider {
    readonly id = "adjacent-doc";

    private cache: Record<string, ICacheEntry<any>> = {};

    async generate(context: BreadcrumbContext): Promise<HTMLElement | null> {
        const setting = context.setting;
        if (setting.showAdjacentDocButton === CONSTANTS.ADJ_NONE) {
            return null;
        }

        const adjacentDocs = await this.getAdjacentDocs(context.pathObjects, context.notebookDocFlag, setting);
        const navElement = document.createElement("span");
        navElement.className = "og-fdb-doc-nav";
        if (setting.simplifyAdjacentDocButton) {
            navElement.classList.add("og-fdb-doc-nav--equal");
        }
        navElement.appendChild(this.createNavButton("previous", adjacentDocs.previousDoc, adjacentDocs.sameLevelPrevious, setting));
        navElement.appendChild(this.createNavButton("next", adjacentDocs.nextDoc, adjacentDocs.sameLevelNext, setting));
        return navElement;
    }

    /** 创建导航按钮 */
    private createNavButton(direction: string, doc: IFile | null, isSameLevel: boolean, setting: any): HTMLElement {
        const isPrevious = direction === "previous";
        const label = isPrevious ? lang("previous_doc") : lang("next_doc");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "og-fdb-doc-nav-button";
        button.setAttribute("data-og-adjacent-direction", direction);

        let buttonText = label;
        if (doc?.id) {
            const docName = trimListDocsByPathAPIReturnedDocName(doc?.name ?? "");
            button.setAttribute("data-doc-id", doc.id);
            button.setAttribute("data-og-doc-title", docName);
            button.setAttribute("title", `${label}: ${docName}`);
            if (!setting.simplifyAdjacentDocButton) {
                buttonText = docName;
            }
        } else {
            button.disabled = true;
            button.setAttribute("title", label);
        }

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("title", button.getAttribute("title") ?? "");
        const use = document.createElementNS(svgNS, "use");
        const iconRef = isPrevious ? "#iconLeft" : "#iconRight";
        use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", iconRef);
        svg.appendChild(use);

        const textSpan = document.createElement("span");
        textSpan.className = "og-fdb-doc-nav-button-text";
        textSpan.textContent = buttonText;

        if (isPrevious) {
            button.appendChild(svg);
            button.appendChild(textSpan);
        } else {
            button.appendChild(textSpan);
            button.appendChild(svg);
        }
        return button;
    }

    /** 获取相邻文档 */
    private async getAdjacentDocs(pathObjects: IPathObject[], notebookDocFlag: boolean, setting: any): Promise<IAdjacentDocs> {
        const result: IAdjacentDocs = {
            previousDoc: null,
            nextDoc: null,
            sameLevelPrevious: false,
            sameLevelNext: false,
        };

        if (!Array.isArray(pathObjects) || (pathObjects.length <= 1 && !notebookDocFlag)) {
            return result;
        }

        const currentDoc = pathObjects[pathObjects.length - 1];
        const previousDoc = pathObjects[pathObjects.length - 2];
        const currentDepth = pathObjects.length - 1;
        let sameLevelDocs: any[] = null;

        if (notebookDocFlag) {
            sameLevelDocs = await this.getNotebookAdjacentDocs(currentDoc.box);
        } else {
            sameLevelDocs = await this.getAdjacentChildDocs(previousDoc);
        }

        const currentIndex = this.findDocIndex(sameLevelDocs, currentDoc.id);
        if (currentIndex < 0) {
            return result;
        }

        result.previousDoc = sameLevelDocs[currentIndex - 1] ?? null;
        result.nextDoc = sameLevelDocs[currentIndex + 1] ?? null;

        // 同层级查找
        if (setting.showAdjacentDocButton === CONSTANTS.ADJ_SAME_LEVEL
            && (!result.previousDoc || !result.nextDoc) && !notebookDocFlag
        ) {
            debugPush("当前文档同级没有足够的文档，尝试向上获取同层级文档");
            const cache: Record<string, any> = {};
            const sameLevelByDepth = await this.getAdjacentDocsByDepth(pathObjects[0], currentDepth, cache);
            const currentIndexByDepth = this.findDocIndex(sameLevelByDepth, currentDoc.id);
            if (result.previousDoc == null && currentIndexByDepth > 0) {
                result.sameLevelPrevious = true;
                result.previousDoc = sameLevelByDepth[currentIndexByDepth - 1] ?? null;
            }
            if (result.nextDoc == null && currentIndexByDepth < sameLevelByDepth.length - 1) {
                result.sameLevelNext = true;
                result.nextDoc = sameLevelByDepth[currentIndexByDepth + 1] ?? null;
            }
        }
        return result;
    }

    /** 获取笔记本的相邻文档 */
    private async getNotebookAdjacentDocs(notebookId: string): Promise<any[]> {
        if (!notebookId) return [];
        const cacheKey = `notebook-${notebookId}`;
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        const notebookList = await getNodebookList() ?? [];
        const result = notebookList.filter((nb: any) => nb.closed === false);
        this.setCache(cacheKey, result);
        return result;
    }

    /** 获取父文档的子文档列表 */
    private async getAdjacentChildDocs(parentDoc: IPathObject, cache: Record<string, any> = null): Promise<any[]> {
        if (!parentDoc?.path || !parentDoc?.box) return [];
        const cacheKey = `${parentDoc.box}-${parentDoc.path}`;

        if (cache && cache[cacheKey]) {
            return cache[cacheKey].data;
        }
        if (!cache) {
            const cached = this.checkCache(cacheKey);
            if (cached) return cached;
        }

        const setting = getReadOnlyGSettings();
        const response = await listDocsByPathT({
            path: parentDoc.path,
            notebook: parentDoc.box,
        });
        const result = (response ?? []).map((doc: any) => {
            doc.box = parentDoc.box;
            return doc;
        });

        if (cache) {
            cache[cacheKey] = { data: result, timestamp: Date.now() };
        }
        this.setCache(cacheKey, result);
        return result;
    }

    /** 按深度递归获取同层级文档 */
    private async getAdjacentDocsByDepth(parentDoc: IPathObject, targetDepth: number, cache: Record<string, any>): Promise<any[]> {
        if (targetDepth <= 0) return [];
        const childDocs = await this.getAdjacentChildDocs(parentDoc, cache);
        if (targetDepth === 1) return childDocs;

        let result: any[] = [];
        for (const childDoc of childDocs) {
            if (childDoc.subFileCount === 0) continue;
            const subDocs = await this.getAdjacentDocsByDepth(childDoc, targetDepth - 1, cache);
            result = result.concat(subDocs);
        }
        return result;
    }

    private findDocIndex(docList: any[], docId: string): number {
        return docList.findIndex((doc) => doc.id === docId);
    }

    private checkCache(key: string): any | null {
        const entry = this.cache[key];
        if (entry && Date.now() - entry.timestamp < CONSTANTS.ADJACENT_DOC_CACHE_TTL) {
            return entry.data;
        }
        return null;
    }

    private setCache(key: string, data: any): void {
        this.cache[key] = { data, timestamp: Date.now() };
    }

    /** 清除缓存 */
    clearCache(): void {
        this.cache = {};
    }

    bindEvents(container: HTMLElement, context: BreadcrumbContext): void {
        container.querySelectorAll(`.og-fdb-doc-nav-button[data-doc-id]`).forEach((elem) => {
            elem.addEventListener("click", (event) => this.clickAdjacentDocButton(event));
        });
    }

    private clickAdjacentDocButton(event: MouseEvent): void {
        const currentTarget = event.currentTarget as HTMLElement;
        const docId = currentTarget?.getAttribute("data-doc-id");
        if (!docId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        openRefLinkByAPI({
            paramDocId: docId,
            keyParam: {
                ctrlKey: event?.ctrlKey,
                shiftKey: event?.shiftKey,
                altKey: event?.altKey,
                metaKey: event?.metaKey,
            },
        });
    }
}
