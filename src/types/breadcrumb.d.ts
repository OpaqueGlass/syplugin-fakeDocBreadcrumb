/**
 * 面包屑相关类型定义
 */

import type { IProtyle } from "siyuan";

export {};

// START global
declare global {

/** 路径层级对象 */
interface IPathObject {
    name: string;
    id: string;
    icon: string;
    path: string;
    box: string;
    type: "NOTEBOOK" | "FILE" | "ROOT";
    subFileCount: number;
}

/** 相邻文档结果 */
interface IAdjacentDocs {
    previousDoc: IFile | null;
    nextDoc: IFile | null;
    sameLevelPrevious: boolean;
    sameLevelNext: boolean;
}

/** 面包屑项类型 */
type BreadcrumbItemType = "FILE" | "NOTEBOOK" | "ROOT" | "...";

/** 相邻文档模式 */
type AdjacentDocMode = "0" | "1" | "2"; // NONE | SAME_PARENT | SAME_LEVEL

/** 图标显示模式 */
type IconMode = 0 | 1 | 2; // NONE | CUSTOM_ONLY | ALL

/** 缓存条目 */
interface ICacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * 面包屑上下文
 * 在主流程中构建，传递给各 Provider 和 Applier
 */
interface BreadcrumbContext {
    docId: string;
    protyle: IProtyle;
    protyleElement: HTMLElement;
    pathObjects: IPathObject[];
    notebookDocFlag: boolean;
    setting: any;
}

/**
 * 内容提供者接口
 * 每个 Provider 负责生成一块独立的面包屑内容元素
 * Provider 不创建容器，不关心插入位置，仅返回自身内容元素
 */
interface IBreadcrumbProvider {
    /** Provider 唯一标识 */
    readonly id: string;

    /**
     * 生成内容元素
     * @param context 面包屑上下文
     * @returns 生成的 HTMLElement，或 null 表示不生成
     */
    generate(context: BreadcrumbContext): Promise<HTMLElement | null>;

    /**
     * 绑定元素的事件监听
     * @param container 统一容器（已插入DOM），Provider 在其中查找自身元素并绑定事件
     * @param context 面包屑上下文
     */
    bindEvents(container: HTMLElement, context: BreadcrumbContext): void;
}

/** protyle 环境信息 */
interface IProtyleEnvInfo {
    mobile: boolean;
    flashCard: boolean;
    notTraditional: boolean;
    originProtyle: IProtyle;
    showAll: boolean;
    popOver: boolean;
}

// END global
}