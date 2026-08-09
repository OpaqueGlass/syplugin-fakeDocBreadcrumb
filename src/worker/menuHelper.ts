import { CONSTANTS } from "@/constants";

const WND_KEY = CONSTANTS.WND_TEMP_ID;

function ensureWnd(): Record<string, any> {
    if (!(WND_KEY in window)) {
        window[WND_KEY] = {};
    }
    return window as any;
}

/** 检查 window[WND_TEMP_ID] 是否已存在（仅读取，不创建） */
export function testTempStorage(): boolean {
    return WND_KEY in window;
}

export function saveMenuInstance(menu: any, id: string) {
    ensureWnd();
    (window as any)[WND_KEY]["recentMenu"] = { menu, id };
}

export function setTopExistCache(topElement: any) {
    ensureWnd();
    (window as any)[WND_KEY]["topElement"] = topElement;
}

export function checkTopExistCache() {
    if (testTempStorage()) {
        return (window as any)[WND_KEY]["topElement"];
    }
    return null;
}

export function removeTopExistCache() {
    ensureWnd();
    (window as any)[WND_KEY]["topElement"] = null;
}

/**
 * 
 * @param id 要清除的菜单id，为null则任意匹配
 * @returns 是否存在相同的菜单实例并已关闭
 */
export function clearMenuInstance(id: string | null): boolean {
    if (!testTempStorage()) {
        return false;
    }
    const store = (window as any)[WND_KEY];
    if (store["recentMenu"]) {
        const tempId = store["recentMenu"]["id"];
        // 存在相同的菜单，仅关闭，不重新打开
        if ((tempId === id || id === null) && document.querySelector("#commonMenu[data-name='og-fdb-relative-menu']")) {
            store["recentMenu"]["menu"]?.close();
            store["recentMenu"] = null;
            return true;
        }
        store["recentMenu"]["menu"]?.close();
        store["recentMenu"] = null;
    }
    return false;
}

// ===== 读写模式（写入 window[CONSTANTS.WND_TEMP_ID]） =====
//  - 指定的 key 不存在时，写入会自动创建该 key（不会 wipe 整个存储）
//  - 读取时若 key 不存在返回 undefined
//  - removeFromWnd 删除指定 key

/** 按 key 读取（key 不存在返回 undefined） */
export function readFromWnd<T = any>(key: string): T | undefined {
    return (ensureWnd() as Record<string, any>)[key];
}

/** 按 key 写入；key 不存在时自动创建（只做属性赋值，不整体重写存储） */
export function writeToWnd(key: string, value: any): void {
    (ensureWnd() as Record<string, any>)[key] = value;
}

/** 删除指定 key */
export function removeFromWnd(key: string): void {
    delete (ensureWnd() as Record<string, any>)[key];
}
