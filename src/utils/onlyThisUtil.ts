import { debugPush, debugWarnPush, errorPush, logPush, warnPush } from "@/logger";
import { DOC_SORT_TYPES, getblockAttr, getCurrentDocIdF, isMobile, queryAPI } from "@/syapi";
import { IProtyle } from "siyuan";
import * as siyuanAPIs from "siyuan";
import { isCurrentVersionLessThan, isValidStr } from "./commonCheck";
import { openRefLinkByAPI } from "./common";
import { getSiyuanBaseConfig } from "@/syapi/commonApiWrapper";
import { CONSTANTS } from "@/constants";

export function getProtyleInfo(protyle: IProtyle):IProtyleEnvInfo {
    let result:IProtyleEnvInfo = {
        mobile: false,
        flashCard: false,
        notTraditional: false,
        originProtyle: protyle,
        showAll: true,
        popOver: false,
    };
    if (protyle.model == null) {
        result["notTraditional"] = true;
    }
    if (protyle?.block?.showAll === false) {
        result["showAll"] = false;
    }
    if (protyle.element.parentElement?.parentElement?.classList.contains("block__popover")) {
        result["popOver"] = true;
    }
    if (isMobile()) {
        result["mobile"] = true;
    }
    if (protyle.element.classList.contains("card__block")) {
        result["flashCard"] = true;
    }
    return result;
}

/**
 * html字符转义
 * 目前仅emoji使用
 * 对常见的html字符实体换回原符号
 * @param {*} inputStr 
 * @returns 
 */
export function htmlTransferParser(inputStr:string): string {
    return decodeHTML(inputStr);
    if (inputStr == null || inputStr == "") return "";
    let transfer = ["&lt;", "&gt;", "&nbsp;", "&quot;", "&amp;"];
    let original = ["<", ">", " ", `"`, "&"];
    for (let i = 0; i < transfer.length; i++) {
        inputStr = inputStr.replace(new RegExp(transfer[i], "g"), original[i]);
    }
    return inputStr;
}

/**
 * 原始字符串 -> 转义为含有字符实体的字符串
 * 例如: "<div>" -> "&lt;div&gt;"
 */
export function encodeHTML(str: string): string {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function decodeHTML(str: string): string {
    if (!str) return "";
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || "";
}


export function getListItemEmojiHtmlStr(iconString:string, hasChild:boolean) {
    // 无emoji的处理
    if (!isValidStr(iconString)) {
        return hasChild ? `<span class="b3-list-item__graphic">📑</span>` : `<span class="b3-list-item__graphic">📄</span>`;
    }
    let result = iconString;
    // emoji地址判断逻辑为出现.，但请注意之后的补全
    if (iconString.startsWith("api/icon/getDynamicIcon")) {
        result = `<img class="b3-list-item__graphic" src="/${iconString}" />`;
    } else if (iconString.indexOf(".") != -1) {
        result = `<img class="b3-list-item__graphic" src="/emojis/${iconString}" />`;
    } else {
        result = `<span class="b3-list-item__graphic">${emojiIconHandler(iconString, hasChild)}</span>`;
    }
    return result;
    function emojiIconHandler(iconString:string, hasChild = false) {
        //确定是emojiIcon 再调用，printer自己加判断
        try {
            let result = "";
            iconString.split("-").forEach(element => {
                //TODO: 确定是否正常
                debugPush("element", element);
                result += String.fromCodePoint(Number("0x" + element));
            });
            return result;
        } catch (err) {
            errorPush("emoji处理时发生错误", iconString, err);
            return hasChild ? "📑" : "📄";
        }
    }
}

/**
 * 通过 iconXxx 获取SVG element
 * @param svgIconHref 
 * @returns 
 */
function getSvgElement(svgIconHref: string): SVGSVGElement {
    if (!svgIconHref.startsWith("icon")) {
        debugWarnPush("getSvgElemetn: ", "svgIconHref 不合法, 原始值为", svgIconHref);
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${svgIconHref}`);
    svg.appendChild(use);
    return svg;
}

enum DocIconType {
    NOTEBOOK,
    PARENT_FILE,
    FILE,
}

function isSvgIconAsDefaultEnabled(): string {
    return getSiyuanBaseConfig().fileTree?.useSVGDefaultIcon ?? false;
}

function getDefaultSvgIcon(type: DocIconType): SVGSVGElement {
    switch (type) {
        case DocIconType.NOTEBOOK:
            return getSvgElement("iconFilesRoot");
        case DocIconType.PARENT_FILE:
            return getSvgElement("iconFileText");
        default:
        case DocIconType.FILE:
            return getSvgElement("iconFile");
    }
}

/**
 * 获取默认EmojiIcon 字符串
 * 不包括html结构
 * @param hasChild 
 * @returns 
 */
function getDefaultEmojiIcon(hasChild: boolean): string {
    let result = null;
    if (window.siyuan.storage["local-images"]) {
        if (hasChild) {
            result = unicodeToEmoji(window.siyuan.storage["local-images"].folder);
        } else {
            result = unicodeToEmoji(window.siyuan.storage["local-images"].file);
        }
    }
    if (result != null) {
        return result;
    }
    return hasChild ? "📑" : "📄";
}

/**
 * 将unicode码转换为emojiIconStr
 * @param unicodeStr 
 * @returns 可空
 */
function unicodeToEmoji(unicodeStr: string): string {
    try {
        let result = "";
        unicodeStr.split("-").forEach(element => {
            result += String.fromCodePoint(Number("0x" + element));
        });
        return result;
    } catch (err) {
        errorPush("emoji处理时发生错误", unicodeStr, err);
        return null;
    }
}

/**
 * 文档图标生成选项
 */
export interface IDocIconOptions {
    iconString: string,
    hasChild: boolean,
    textClassName?: string,
    picClassName?: string,
    svgClassName?: string, // 仅对 svg 图标生效的 class
    wrapSvg?: boolean, // span 包装默认svg图标（emoji 文本始终包裹 span）
    wrapBlank?: boolean,// span 包装空值
    iconMode?: string,
}

/**
 * 生成文档图标 HTMLElement 元素
 * @param param0 
 * @returns 
 */
function getDocIconElement({
    iconString,
    hasChild,
    textClassName = "og-fdb-menu-emojitext",
    picClassName = "og-fdb-menu-emojipic",
    svgClassName = "",
    wrapSvg = true,
    wrapBlank = true,
    iconMode = CONSTANTS.ICON_CUSTOM_ONLY,
    outerHtmlTag = ""
}: IDocIconOptions & { outerHtmlTag?: string | null }): Element {
    let result: HTMLElement = outerHtmlTag == null ? null : document.createElement(outerHtmlTag);
    let tempResult: Element = null;

    // 根据类型判断
    if (iconString.startsWith("api/icon/getDynamicIcon")) {
        // 动态图标
        let tempImgResult = document.createElement("img");
        tempImgResult.src = `/${iconString}`;
        tempImgResult.className = picClassName;
        tempResult = tempImgResult;
    } else if (iconString.indexOf(".") != -1) {
        // 本地图标
        let tempImgResult = document.createElement("img");
        tempImgResult.src = `/emojis/${iconString}`;
        tempImgResult.className = picClassName;
        tempResult = tempImgResult;
    } else if (isValidStr(iconString)) {
        // unicode
        let tempSpanResult = document.createElement("span");
        tempSpanResult.className = textClassName;
        tempSpanResult.textContent = unicodeToEmoji(iconString);
        tempResult = tempSpanResult;
    } else if (isSvgIconAsDefaultEnabled() && iconMode == CONSTANTS.ICON_ALL) {
        //@ts-ignore
        let tempSvgResult = getDefaultSvgIcon(hasChild ? DocIconType.PARENT_FILE : DocIconType.FILE);
        // svgClassName 仅对 svg 本身生效
        if (isValidStr(svgClassName)) {
            tempSvgResult.classList.add(...svgClassName.split(" "));
        }
        if (wrapSvg) {
            let tempSpanResult = document.createElement("span");
            tempSpanResult.className = textClassName;
            tempSpanResult.appendChild(tempSvgResult);
            tempResult = tempSpanResult;
        } else {
            tempResult = tempSvgResult;
        }
    } else if (iconMode == CONSTANTS.ICON_ALL) {
        // 代码片段默认值
        let tempSpanResult = document.createElement("span");
        tempSpanResult.className = textClassName;
        tempSpanResult.textContent = getDefaultEmojiIcon(hasChild);
        tempResult = tempSpanResult;
    } else if (wrapBlank) {
        // 空值也包装
        let tempSpanResult = document.createElement("span");
        tempSpanResult.className = textClassName;
        tempResult = tempSpanResult;
    }

    if (result == null) {
        return tempResult;
    } else {
        result.appendChild(tempResult);
        return result;
    }
}

/**
 * 生成 emoji HTML 字符串（用于菜单项等需要 HTML 字符串的场景）
 * 对应原 refer.js 中的 getEmojiHtmlStr
 * @param options 文档图标生成选项
 * @returns 
 */
export function getEmojiHtmlStr(options: IDocIconOptions): string {
    if (options.iconMode === CONSTANTS.ICON_NONE) return ``;
    return getDocIconElement({
        ...options,
        outerHtmlTag: null
    })?.outerHTML ?? "";
}

/**
 * 生成 emoji HTMLElement（用于面包屑项等需要 DOM 元素的场景）
 * @param options 文档图标生成选项
 * @returns 
 */
export function getEmojiElement(options: IDocIconOptions): HTMLElement | null {
    if (options.iconMode === CONSTANTS.ICON_NONE) return null;
    return getDocIconElement({
        ...options,
        outerHtmlTag: null,
        wrapSvg: true,
        wrapBlank: false
    }) as HTMLElement;
}

/**
 * 去除字符串中的 HTML 标签，返回纯文本
 * 对应原 refer.js 中的 stripHTML
 */
export function stripHTML(input: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");
    return doc.documentElement.textContent || "";
}

/**
 * HTML 字符转义，防止菜单项文本中的特殊字符破坏 HTML 结构
 * 对应原 refer.js 中的 escapeHTML
 */
export function escapeHTML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 使用设置中的参数处理文档
 * @param param0 
 */
export function openRefLinkByAPIWithConfig({mouseEvent, paramDocId = "", keyParam = undefined, openInFocus = undefined, g_setting}: {mouseEvent?: MouseEvent, paramDocId?: string, keyParam?: any, openInFocus?: boolean, g_setting: any}) {
    let removeCurrentTab = undefined;
    let autoRemoveJudgeMiliseconds = 0;
    if (g_setting.openDocRemoveCurrentTab == "true") {
        removeCurrentTab = true;
    }
    if (g_setting.openDocRemoveCurrentTab == "false") {
        removeCurrentTab = false;
    }
    if (g_setting.autoRemoveOldTabJudgeMiliseconds != 0 && Number.isInteger(g_setting.autoRemoveOldTabJudgeMiliseconds)) {
        autoRemoveJudgeMiliseconds = g_setting.autoRemoveOldTabJudgeMiliseconds;
    }
    let openDocMode = undefined;
    if (mouseEvent && mouseEvent.target) {
        // 向上寻找最多10层，如果.class中有预览相关的，则调整Mode为preview
        let currentElement = mouseEvent.target as HTMLElement;
        let findPreview = false;
        for (let i = 0; i < 10; i++) {
            if (currentElement.classList.contains("protyle-preview")) {
                findPreview = true;
                break;
            }
            if (currentElement.parentElement) {
                currentElement = currentElement.parentElement;
            } else {
                break;
            }
        }
        if (findPreview) {
            openDocMode = "preview";
        }
    }
    // TODO: 集中处理，以防止嵌套触发；不stopProp是为了分屏情况在正确的分屏区打开
    // if (mouseEvent.currentTarget != mouseEvent.target && mouseEvent.currentTarget.classList.contains("refLinks") && mouseEvent.target.classList.contains("refLinks")) {
    //     debugPush("WARN");
    // } else {
    //     debugPush("WARNCliked", mouseEvent.currentTarget, mouseEvent.target);
    // }
    openRefLinkByAPI({mouseEvent, paramDocId, keyParam, openInFocus, removeCurrentTab, autoRemoveJudgeMiliseconds, "mode": openDocMode});
}

export function trimListDocsByPathAPIReturnedDocName(docName: string) {
    if (isCurrentVersionLessThan("3.6.5") && docName.endsWith(".sy")) {
        return  docName.substring(0, docName.length - 3);
    } else {
        return docName;
    }
}

export function removeCurrentTabF(docId?:string) {
    // 获取tabId
    if (!isValidStr(docId)) {
        docId = getCurrentDocIdF(true);
    }
    if (!isValidStr(docId)) {
        debugPush("错误的id或多个匹配id");
        return;
    }
    // v3.1.11或以上
    if (siyuanAPIs?.getAllEditor) {
        const editor = siyuanAPIs.getAllEditor();
        let protyle = null;
        for (let i = 0; i < editor.length; i++) {
            if (editor[i].protyle.block.rootID === docId) {
                protyle = editor[i].protyle;
                break;
            }
        }
        if (protyle) {
            if (protyle.model.headElement) {
                if (protyle.model.headElement.classList.contains("item--pin")) {
                    debugPush("Pin页面，不关闭存在页签");
                    return;
                }
            }
            //id: string, closeAll = false, animate = true, isSaveLayout = true
            debugPush("关闭存在页签", protyle?.model?.parent?.parent, protyle.model?.parent?.id);
            protyle?.model?.parent?.parent?.removeTab(protyle.model?.parent?.id, false, false);
        } else {
            debugPush("没有找到对应的protyle，不关闭存在的页签");
            return;
        }
    } else { // v3.1.10或以下
        return;
    }

}

/**
 * 获取临近的日记
 * @param param0 sqlResult^: 查询结果，docId&: 文档id，boxId&: 笔记本id，getNewer: 是否获取更新的日记，ialObject*: ial对象
 * @returns 
 */
export async function getNeighborDailyNoteDoc({sqlResult=null, docId=null, boxId=null, getNewer=true, ialObject=null}: {sqlResult?: any, docId?: string, getNewer?: boolean, ialObject?:any, boxId?: string}) {
    if (sqlResult == null && boxId == null) {
        sqlResult = await queryAPI(`SELECT * FROM blocks WHERE id = '${docId}'`);
    } else if (sqlResult == null && isValidStr(boxId) && isValidStr(docId)) {
        sqlResult = [{"id": docId, "box": boxId, "ial": JSON.stringify(ialObject)}];
    }
    if (sqlResult == null || sqlResult.length == 0) {
        debugPush("未找到对应的block");
        throw new Error("未找到对应的block" + docId);
    }
    if (!sqlResult[0].ial?.includes("custom-dailynote")) {
        return null;
    }
    // 我们应该根据情况获取，如果是按照月构建的dailynote，同一笔记上可能有多个标签
    let minCurrentDate = Number.MAX_SAFE_INTEGER.toString(); // 向上跳转用
    let maxCurrentDate = "0";
    if (ialObject == null) {
        ialObject = await getblockAttr(sqlResult[0].id);
    }
    for (const key in ialObject) {
        if (key.startsWith("custom-dailynote-")) {
            if (parseInt(ialObject[key]) > parseInt(maxCurrentDate)) {
                maxCurrentDate = ialObject[key];
            } 
            if (parseInt(ialObject[key]) < parseInt(minCurrentDate)) {
                minCurrentDate = ialObject[key];
            }
        }
    }
    if ((getNewer && maxCurrentDate == "0") && (!getNewer && minCurrentDate == Number.MAX_SAFE_INTEGER.toString())) {
        return null;
    }
    // 在这里我们假定id前截取到的8位数是dailynote的创建时间
    const response = await queryAPI(`
    SELECT b.content as name, b.id
    FROM attributes AS a
    JOIN blocks AS b ON a.root_id = b.id
    WHERE a.name LIKE 'custom-dailynote%' AND a.block_id = a.root_id
    AND b.box = '${sqlResult[0].box}' 
    AND a.value ${getNewer ? ">" : "<"} '${getNewer ? maxCurrentDate : minCurrentDate}'
    ORDER BY
    a.value ${getNewer ? "ASC" : "DESC"}
    LIMIT 1`);
    debugPush("dailyNote结果", response);
    if (response && response.length > 0) {
        return response[0];
    } else {
        debugPush("日记未定位到结果");
        return null;
    }
}

// export function getNotebookSortMode(boxId: string) {
//     let sortType: string|number = window.document.querySelector(`.file-tree.sy__file ul[data-url='${boxId}']`)?.getAttribute("data-sortmode");
//     if (!isValidStr(sortType)) {
//         sortType = window.siyuan.notebooks.filter((item) => item.id == boxId)[0]?.sortMode;
//     }
//     if (typeof sortType === "string") {
//         sortType = parseInt(sortType, 10);
//     }
//     if (sortType == DOC_SORT_TYPES.FOLLOW_DOC_TREE_ORI) {
//         sortType = window.siyuan.config?.fileTree?.sort;
//     }
//     return sortType;
// }

export function isSortAsc(sortMode: number) {
    return [DOC_SORT_TYPES.FILE_NAME_ASC, DOC_SORT_TYPES.NAME_NAT_ASC, DOC_SORT_TYPES.CREATED_TIME_ASC, 
        DOC_SORT_TYPES.MODIFIED_TIME_ASC, DOC_SORT_TYPES.REF_COUNT_ASC, DOC_SORT_TYPES.DOC_SIZE_ASC,
        DOC_SORT_TYPES.SUB_DOC_COUNT_ASC
    ].includes(sortMode);
}

export function isSortByNameOrCreateTime(sortMode: number) {
    return [DOC_SORT_TYPES.FILE_NAME_ASC, DOC_SORT_TYPES.FILE_NAME_DESC, DOC_SORT_TYPES.NAME_NAT_ASC,
        DOC_SORT_TYPES.NAME_NAT_DESC, DOC_SORT_TYPES.CREATED_TIME_ASC, DOC_SORT_TYPES.CREATED_TIME_DESC
    ].includes(sortMode);
}