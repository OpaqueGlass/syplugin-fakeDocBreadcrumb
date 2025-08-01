/**
 * 
 */
const siyuan = require('siyuan');

/**
 * 全局变量
 */
let g_mutex = {};
const CONSTANTS = {
    RANDOM_DELAY: 300, // 插入挂件的延迟最大值，300（之后会乘以10）对应最大延迟3秒
    OBSERVER_RANDOM_DELAY: 500, // 插入链接、引用块和自定义时，在OBSERVER_RANDOM_DELAY_ADD的基础上增加延时，单位毫秒
    OBSERVER_RANDOM_DELAY_ADD: 100, // 插入链接、引用块和自定义时，延时最小值，单位毫秒
    OBSERVER_RETRY_INTERVAL: 1000, // 找不到页签时，重试间隔
    STYLE_ID: "fake-doc-breadcrumb-plugin-style",
    ICON_ALL: 2,
    ICON_NONE: 0,
    ICON_CUSTOM_ONLY: 1,
    PLUGIN_NAME: "og_fake_doc_breadcrumb",
    SAVE_TIMEOUT: 900,
    CONTAINER_CLASS_NAME: "og-fake-doc-breadcrumb-container", 
    ARROW_SPAN_NAME: "og-fake-doc-breadcrumb-arrow-span",
    ARROW_CLASS_NAME: "og-fake-doc-breadcrumb-arrow",
    MENU_ITEM_CLASS_NAME: "og-fake-doc-breadcrumb-menu-item-container",
    SIBLING_CONTAINER_ID: "og-fake-doc-breadcrumb-sibling-doc-container",
    INDICATOR_CLASS_NAME: "og-fake-doc-breadcrumb-doc-indicator",
    MENU_CURRENT_DOC_CLASS_NAME: "og-fdb-current-doc-in-menu",
    POP_NONE: 0,
    POP_LIMIT: 1,
    POP_ALL: 2,
    MAX_NAME_LENGTH: 15,
    MULTILINE_CONFLICT_PLUGINS: ["siyuan-plugin-toolbar-plus"],
}
let g_initRetryInterval;
let g_initFailedMsgTimeout;
let g_TIMER_LABLE_NAME_COMPARE = "文档面包屑插件";
let g_writeStorage;
let g_relativeMenu;
let g_isMobile = false;
let g_hidedBreadcrumb = false;
let g_setting = {
    "nameMaxLength": null,
    "docMaxNum": null,
    "showNotebook": null,
    "typeHide": null,
    "foldedFrontShow": null,
    "foldedEndShow": null,
    "oneLineBreadcrumb": null,
    "timelyUpdate": null, // 及时响应更新
    "allowFloatWindow": null,
    "usePluginArrow": null,
    "preferOpenInCurrentSplit": null,
    "icon": null,
    "menuKeepCurrentVisible": null,
    "menuExtendSubDocDepth": null,
    "swapClickFunction": null,
};
let g_setting_default = {
    "nameMaxLength": 15,
    "docMaxNum": 128,
    "showNotebook": true,
    "typeHide": false,
    "foldedFrontShow": 2,
    "foldedEndShow": 3,
    "oneLineBreadcrumb": false,
    "timelyUpdate": true, // 及时响应更新
    "immediatelyUpdate": false, // 实时响应更新
    "allowFloatWindow": false, // 触发浮窗
    "usePluginArrow": true, // 使用挂件>箭头
    "notOnlyOpenDocs": false, // 除了打开的文档之外，不再判断load-protyle调用来源，一律执行面包屑插入，可能带来不期待的后果
    "preferOpenInCurrentSplit": true,
    "icon": 1,
    "menuKeepCurrentVisible": true,
    "menuExtendSubDocDepth": 2,
    "swapClickFunction": false,
};
/**
 * Plugin类
 */
class FakeDocBreadcrumb extends siyuan.Plugin {

    tabOpenObserver =  null;

    onload() {
        g_isMobile = isMobile();
        language = this.i18n;
        // 读取配置
        // TODO: 读取配置API变更
        Object.assign(g_setting, g_setting_default);
        if (isSomePluginExist(this.app.plugins, CONSTANTS.MULTILINE_CONFLICT_PLUGINS)) {
            g_setting.oneLineBreadcrumb = true;
        }

        g_writeStorage = this.saveData;
        
        debugPush('FakeDocBradcrumbPluginInited');
    }

    onLayoutReady() {
        this.loadData("settings.json").then((settingCache)=>{
            // 解析并载入配置
            try {
                debugPush("载入配置中",settingCache);
                // let settingData = JSON.parse(settingCache);
                Object.assign(g_setting, settingCache);
                this.eventBusInnerHandler();
            }catch(e){
                warnPush("og-fdb载入配置时发生错误",e);
            }
            // console.log("LOADED",settingData);
            // console.log("LOADED_R", g_setting);
            // 开始运行
            // try {
            //     setObserver();
            //     setStyle();
            // }catch(e) {
            //     errorPush("文档导航插件首次初始化失败", e);
                // g_initRetryInterval = setInterval(initRetry, 2500);
            // }  
            if (!initRetry()) {
                errorPush("初始化失败，2秒后执行一次重试");
                setTimeout(initRetry, 2000);
            }
        }, (e)=> {
            warnPush("配置文件读入失败", e);
        });
    }

    onunload() {
        this.el && this.el.remove();
        removeStyle();
        removeMouseKeyboardListener();
        this.offEventBusInnerHander();
        // 移除已经插入的部分
        [].forEach.call(document.querySelectorAll(".og-fake-doc-breadcrumb-container"), (elem)=>{
            elem.remove();
        });
    }
    openSetting() {// 创建dialog
        const settingDialog = new siyuan.Dialog({
            "title": language["setting_panel_title"],
            "content": `
            <div class="b3-dialog__content" style="flex: 1;">
                <div id="${CONSTANTS.PLUGIN_NAME}-form-content" style="overflow: auto;"></div>
            </div>
            <div class="b3-dialog__action" id="${CONSTANTS.PLUGIN_NAME}-form-action" style="max-height: 40px">
                <button class="b3-button b3-button--cancel">${language["button_cancel"]}</button><div class="fn__space"></div>
                <button class="b3-button b3-button--text">${language["button_save"]}</button>
            </div>
            `,
            "width": isMobile() ? "92vw":"1040px",
            "height": isMobile() ? "50vw":"80vh",
        });
        debugPush("dialog", settingDialog);
        const actionButtons = settingDialog.element.querySelectorAll(`#${CONSTANTS.PLUGIN_NAME}-form-action button`);
        actionButtons[0].addEventListener("click",()=>{settingDialog.destroy()}),
        actionButtons[1].addEventListener("click",()=>{
            debugPush('SAVING');
            let uiSettings = loadUISettings(settingForm);
            if (isSomePluginExist(this.app.plugins, CONSTANTS.MULTILINE_CONFLICT_PLUGINS) && uiSettings.oneLineBreadcrumb == false) {
                siyuan.showMessage(`${language["conflict_plugin_oneline_breadcrumb"]}<br/> ——[${this.name}]`, 13000);
            }
            this.saveData(`settings.json`, JSON.stringify(uiSettings));
            Object.assign(g_setting, uiSettings);
            removeStyle();
            setStyle();  
            removeMouseKeyboardListener();
            setMouseKeyboardListener();
            this.offEventBusInnerHander();
            this.eventBusInnerHandler();
            debugPush("SAVED");
            settingDialog.destroy();
        });
        // 绑定dialog和移除操作

        // 生成配置页面
        const hello = document.createElement('div');
        const settingForm = document.createElement("form");
        settingForm.setAttribute("name", CONSTANTS.PLUGIN_NAME);
        settingForm.innerHTML = generateSettingPanelHTML([
            new SettingProperty("RESERVE_HINT", "HINT", null),
            new SettingProperty("docMaxNum", "NUMBER", [0, 1024]),
            new SettingProperty("nameMaxLength", "NUMBER", [0, 1024]),
            new SettingProperty("showNotebook", "SWITCH", null),
            new SettingProperty("typeHide", "SWITCH", null),
            new SettingProperty("oneLineBreadcrumb", "SWITCH", null),
            new SettingProperty("foldedFrontShow", "NUMBER", [0, 8]),
            new SettingProperty("foldedEndShow", "NUMBER", [0, 8]),
            new SettingProperty("allowFloatWindow", "SWITCH", null),
            new SettingProperty("usePluginArrow", "SWITCH", null),
            new SettingProperty("notOnlyOpenDocs", "SWITCH", null),
            new SettingProperty("preferOpenInCurrentSplit", "SWITCH", null),
            new SettingProperty("icon", "SELECT", [
                {value:0},
                {value:1},
                {value:2}]),
            new SettingProperty("immediatelyUpdate", "SWITCH", null),
            new SettingProperty("menuExtendSubDocDepth", "NUMBER", [1, 7]),
            new SettingProperty("swapClickFunction", "SWITCH", null),
        ]);

        hello.appendChild(settingForm);
        settingDialog.element.querySelector(`#${CONSTANTS.PLUGIN_NAME}-form-content`).appendChild(hello);
    }

    /**
     * 在这里启用eventBus事件监听，但请务必在offEventBusInnerHandler中设置对应的关闭
     */
    eventBusInnerHandler() {
        this.eventBus.on("loaded-protyle-static", mainEventBusHander);
        this.eventBus.on("switch-protyle", mainEventBusHander);
        if (g_setting.immediatelyUpdate) {
            this.eventBus.on("ws-main", eventBusHandler);
        }
    }

    offEventBusInnerHander() {
        this.eventBus.off("ws-main", eventBusHandler);
        this.eventBus.off("loaded-protyle-static", mainEventBusHander);
        this.eventBus.off("switch-protyle", mainEventBusHander);
    }
}



// debug push
let g_DEBUG = 2;
const g_NAME = "fdb";
const g_FULLNAME = "文档面包屑";

/*
LEVEL 0 忽略所有
LEVEL 1 仅Error
LEVEL 2 Err + Warn
LEVEL 3 Err + Warn + Info
LEVEL 4 Err + Warn + Info + Log
LEVEL 5 Err + Warn + Info + Log + Debug
*/
function commonPushCheck() {
    if (window.top["OpaqueGlassDebugV2"] == undefined || window.top["OpaqueGlassDebugV2"][g_NAME] == undefined) {
        return g_DEBUG;
    }
    return window.top["OpaqueGlassDebugV2"][g_NAME];
}

function isDebugMode() {
    return commonPushCheck() > g_DEBUG;
}

function debugPush(str, ...args) {
    if (commonPushCheck() >= 5) {
        console.debug(`${g_FULLNAME}[D] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function infoPush(str, ...args) {
    if (commonPushCheck() >= 3) {
        console.info(`${g_FULLNAME}[I] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function logPush(str, ...args) {
    if (commonPushCheck() >= 4) {
        console.log(`${g_FULLNAME}[L] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function errorPush(str, ... args) {
    if (commonPushCheck() >= 1) {
        console.error(`${g_FULLNAME}[E] ${new Date().toLocaleString()} ${str}`, ...args);
        console.trace(args[0] ?? undefined);
    }
}

function warnPush(str, ... args) {
    if (commonPushCheck() >= 2) {
        console.warn(`${g_FULLNAME}[W] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

class SettingProperty {
    id;
    simpId;
    name;
    desp;
    type;
    limit;
    value;
    /**
     * 设置属性对象
     * @param {*} id 唯一定位id
     * @param {*} type 设置项类型
     * @param {*} limit 限制
     */
    constructor(id, type, limit, value = undefined) {
        this.id = `${CONSTANTS.PLUGIN_NAME}_${id}`;
        this.simpId = id;
        this.name = language[`setting_${id}_name`];
        this.desp = language[`setting_${id}_desp`];
        this.type = type;
        this.limit = limit;
        if (value) {
            this.value = value;
        }else{
            this.value = g_setting[this.simpId];
        }
    }
}

function initRetry() {
    let successFlag = false;
    try {
        removeStyle();
        removeMouseKeyboardListener();
        setStyle();
        setMouseKeyboardListener();
        successFlag = true;
        clearTimeout(g_initFailedMsgTimeout);
    }catch(e) {
        errorPush("文档面包屑插件初始化失败", e);
    }
    if (successFlag) {
        clearInterval(g_initRetryInterval);
        logPush("文档面包屑插件初始化成功");
        return true;
    }
    return false;
}

async function mainEventBusHander(detail) {
    // 相关判断方式参考： https://github.com/siyuan-note/siyuan/issues/9458#issuecomment-1773776115
    detail = detail.detail;
    const protyle = detail.protyle;
    // 部分情况下，进入文档会停留在默认的聚焦，这里先运行了看看情况
    if (protyle.model == null && !g_setting.notOnlyOpenDocs /* || protyle.block.showAll */) {
        infoPush("插件内嵌Protyle、浮窗~~或聚焦~~。停止操作。", protyle);
        return;
    }
    debugPush("正确Protyle", protyle);
    await main(protyle);
}


async function eventBusHandler(detail) {
    // console.log(detail);
    const cmdType = ["moveDoc", "rename", "removeDoc"];
    if (cmdType.indexOf(detail.detail.cmd) != -1) {
        try {
            debugPush("检查刷新中（由重命名、移动或删除触发）");
            
            const allEditor = siyuan.getAllEditor();
            const ids = getAllShowingDocId();
            if (ids != null && ids.length > 0) {
                for (let editor of allEditor) {
                    if (ids.includes(editor.protyle.block.rootID)) {
                        debugPush("由重命名、移动或删除触发");
                        await main(editor.protyle);
                    }
                }
            }
        }catch(err) {
            errorPush(err);
        }
    }
}

async function main(eventProtyle) {
    if (g_isMobile) {
        debugPush("插件停止支持移动端");
        return;
    }
    let retryCount = 0;
    let success = false;
    let failDueToEmptyId = false;
    let errorTemp = null;
    let uuid = eventProtyle?.element?.getAttribute("data-id") ?? eventProtyle?.block?.rootID;
    // do {
        retryCount ++ ;
        if (g_mutex[uuid] != null && g_mutex[uuid] > 0) {
            debugPush("发现已有main正在运行，已停止");
            return;
        }
        try {
            if (g_mutex[uuid]) {
                g_mutex[uuid]++;
            } else {
                g_mutex[uuid] = 1;
            }
            // 获取当前文档id
            // const docId = getCurrentDocIdF();
            const docId = eventProtyle.block.rootID;
            if (!isValidStr(docId)) {
                failDueToEmptyId = true;
                debugPush(`第${retryCount}次获取文档id失败，休息一会儿后重新尝试`);
                await sleep(200);
                // continue;
            }
            failDueToEmptyId = false;
            const docDetail = await getCurrentDocDetail(docId, eventProtyle);
            debugPush('DETAIL', docDetail);
            if (!isValidStr(docDetail)) {
                logPush("数据库中找不到当前打开的文档");
                return;
            }
            // 检查是否重复插入
            if (!g_setting.timelyUpdate &&  window.top.document.querySelector(`.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .${CONSTANTS.CONTAINER_CLASS_NAME}`)) {
                debugPush("重复插入，操作停止");
                return;
            }
            // 获取并解析hpath与path
            let pathObject = await parseDocPath(docDetail, docId);
            debugPush("OBJECT", pathObject);
            // 组合显示元素
            let element = await generateElement(pathObject, docId, eventProtyle);
            debugPush("ELEMT", element);
            // 插入显示元素和设置监听
            setAndApply(element, docId, eventProtyle);
            success = true;
        }catch(err){
            warnPush(err);
            errorPush(err);
            errorTemp = err;
        }finally{
            g_mutex[uuid]--;
        }
        if (errorTemp) {
            debugPush("由于出现错误，终止重试", errorTemp);
            // break;
        }
        if (!success) {
            debugPush(`重试中${retryCount}，休息一会儿后重新尝试`);
            await sleep(200);
        } else {
            // break;
        }
    // } while (retryCount < 1);
    // if (!success && failDueToEmptyId) {
    //     logPush("未能获取文档id，且重试次数已达上限，停止重试");
    // } else if (!success) {
    //     logPush("重试次数已达上限，停止重试");
    //     // 抛出是为了防止后续错误
    //     throw new Error(errorTemp);
    // }
    
}

function sleep(time){
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function parseDocPath(docDetail) {
    let pathArray = docDetail.path.substring(0, docDetail.path.length - 3).split("/");
    // 处理并发意外
    let hpath = docDetail.hpath ?? await getHPathByID(docDetail.docId);
    let hpathArray = hpath.split("/");
    let resultArray = [];
    let notebooks = getNotebooks();
    let box;
    for (let notebook of notebooks) {
        if (notebook.id == docDetail.box) {
            box = notebook;
            break;
        }
    }
    let temp = {
        "name": box.name,
        "id": box.id,
        "icon": box.icon,
        "box": box.id,
        "path": "/",
        "type": "NOTEBOOK",
        "subFileCount": -1,
    }
    resultArray.push(temp);
    // 获取图标
    let icons = [""]
    let subFileCounts = [-1]
    if (g_setting.icon != CONSTANTS.ICON_NONE) {
        let promiseList = [];
        for (let i = 1; i < pathArray.length; i++) {
            promiseList.push(getDocInfo(pathArray[i]));
        }
        let iconResult = await Promise.all(promiseList);
        for (let i of iconResult) {
            icons.push(i.icon);
            subFileCounts.push(i.subFileCount);
        }
    }
    let temp_path = "";
    for (let i = 1; i < pathArray.length; i++) {
        let temp = {
            "name": hpathArray[i],
            "id": pathArray[i],
            "icon": "",
            "path": `${temp_path}/${pathArray[i]}.sy`,
            "box": box.id,
            "type": "FILE",
            "subFileCount": -1
        }
        if (g_setting.icon != CONSTANTS.ICON_NONE) {
            temp["icon"] = icons[i];
            temp["subFileCount"] = subFileCounts[i]
        }
        temp_path += "/" + pathArray[i];
        resultArray.push(temp);
    }
    return resultArray;
}

async function generateElement(pathObjects, docId, protyle) {
    const divideArrow = `<span class="${CONSTANTS.ARROW_SPAN_NAME} " data-og-type="%4%" data-parent-id="%5%" data-next-id="%6%" data-og-path="%7%" data-og-box="%8%"><svg class="${g_setting.usePluginArrow ? CONSTANTS.ARROW_CLASS_NAME : "protyle-breadcrumb__arrow"}"
        >
        <use xlink:href="#iconRight"></use></svg></span>
        `;
    const oneItem = `<span class="protyle-breadcrumb__item fake-breadcrumb-click" %FLOATWINDOW% data-node-id="%0%" data-og-type="%3%" data-node-names="%NAMES%"  data-next-id="%6%" data-og-path="%7%" data-og-box="%8%">
        %4%
        <span class="protyle-breadcrumb__text" title="%1%">%2%</span>
    </span>
    `;
    let htmlStr = "";
    let countDebug = 0;
    // 折叠隐藏自
    const foldStartAt = g_setting.showNotebook ? g_setting.foldedFrontShow : 
        g_setting.foldedFrontShow + 1;
    // 折叠隐藏结束于
    const foldEndAt = pathObjects.length - g_setting.foldedEndShow - 1;
    for (let i = 0; i < pathObjects.length; i++) {
        countDebug++;
        if (countDebug > 200) {
            throw new Error(">_<出现死循环");
        }
        // 层级过深时，对中间内容加以限制
        if (pathObjects.length > 5 && i >= foldStartAt && i <= foldEndAt) {
            let hidedIds = new Array();
            let hidedNames = new Array();
            let hideFrom = foldStartAt;
            // 过滤笔记本，因为笔记本不可点击
            if (hideFrom <= 0) hideFrom = 1;
            for (let j = hideFrom;
                 j <= foldEndAt; j++) {
                hidedIds.push(pathObjects[j].id);
                hidedNames.push(pathObjects[j].name);
            }
            debugPush(hidedIds, hidedNames);
            htmlStr += oneItem
                .replaceAll("%0%", JSON.stringify(hidedIds).replaceAll(`"`, `'`))
                .replaceAll("%1%", "···")
                .replaceAll("%2%", `···`)
                .replaceAll("%3%", "...")
                .replaceAll("%4%", "")
                .replaceAll("%NAMES%", JSON.stringify(hidedNames).replaceAll(`"`, `'`))
                .replaceAll("%FLOATWINDOW%", "");
            htmlStr += divideArrow.replaceAll("%4%", "FILE") // HIDE时不理会
                .replaceAll("%5%", pathObjects[foldEndAt].id)
                .replaceAll("%6%", pathObjects[foldEndAt+1]?.id)
                .replaceAll("%7%", pathObjects[foldEndAt].path)
                .replaceAll("%8%", pathObjects[foldEndAt].box);
            i = foldEndAt;
            // 避免为负数，但好像没啥用
            if (i < 0) i = 0;
            continue;
        }
        let onePathObject = pathObjects[i];
        if (g_setting.showNotebook && i == 0 || i != 0) {
            htmlStr += oneItem
                .replaceAll("%0%", onePathObject.id)
                .replaceAll("%1%", onePathObject.name)
                .replaceAll("%2%", onePathObject.name)
                .replaceAll("%3%", onePathObject.type)
                .replaceAll("%4%", getEmojiHtmlStr(onePathObject.icon, onePathObject.subFileCount != 0, "og-fdb-bread-emojitext", "og-fdb-bread-emojipic", true, false))
                .replaceAll("%FLOATWINDOW%", g_setting.allowFloatWindow && onePathObject.type == "FILE" ? `data-type="block-ref" data-subtype="d" data-id="${onePathObject.id}"` : "")
                .replaceAll("%5%", pathObjects[i].id)
                .replaceAll("%6%", pathObjects[i+1]?.id)
                .replaceAll("%7%", pathObjects[i].path)
                .replaceAll("%8%", pathObjects[i].box);
        }
        // 最后一个文档、且不含子文档跳出判断
        if (i == pathObjects.length - 1 && !await isChildDocExist(onePathObject.id)) {
            continue;
        }
        htmlStr += divideArrow
            .replaceAll("%4%", onePathObject.type)
            .replaceAll("%5%", pathObjects[i].id)
            .replaceAll("%6%", pathObjects[i+1]?.id)
            .replaceAll("%7%", pathObjects[i].path)
            .replaceAll("%8%", pathObjects[i].box);
        // if (i == pathObjects.length - 1) {
        //     htmlStr += oneItem.replaceAll("%0%", pathObjects[i].id)
        //     .replaceAll("%1%", "···")
        //     .replaceAll("%2%", `···`)
        //     .replaceAll("%3%", "END-CHILD");
        // }
    }

    let result = document.createElement("div");
    let barElement = document.createElement("div");
    barElement.classList.add("protyle-breadcrumb__bar");
    // barElement.classList.add("protyle-breadcrumb__bar--nowrap");
    barElement.innerHTML = htmlStr;
    result.appendChild(barElement);
    result.classList.add(CONSTANTS.CONTAINER_CLASS_NAME);
    if (!g_setting.oneLineBreadcrumb) {
        result.classList.add("protyle-breadcrumb");
    } else {
        result.classList.add("og-breadcrumb-oneline");
    }
    let spaceElement = document.createElement("span");
    spaceElement.classList.add("protyle-breadcrumb__space");
    result.appendChild(spaceElement);
    // result.style.top = (window.document.querySelector(`.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .protyle-breadcrumb`).clientHeight) + "px";
    // 修改以使得内容下移30px .protyle-content
    return result;
    async function isChildDocExist(id) {
        const sqlResponse = await listDocsByPath({path: protyle.path, notebook: protyle.notebookId, maxListLength: 3});
        if (sqlResponse && sqlResponse.files.length > 0) {
            return true;
        }
        return false;
    }
}

function setAndApply(finalElement, docId, eventProtyle) {
    const protyleElem = eventProtyle.element;
    // 移除已有的面包屑
    const tempOldElem = protyleElem.querySelector(`.og-fake-doc-breadcrumb-container`);
    debugPush("setAndApply定位原有面包屑全部匹配结果", protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container`));
    debugPush("setAndApply定位文档位置全部匹配结果", protyleElem.querySelectorAll(`.protyle-breadcrumb__bar`));
    if (tempOldElem) {
        tempOldElem.remove();
        debugPush("移除原有面包屑成功");
    }

    // 判断是否为抽认卡页面，若为抽认卡页面，强制分行显示
    let isCardPage = protyleElem.classList.contains("card__block");
    debugPush("是否为抽认卡页面", isCardPage);
    // 分行或同行插入处理
    if (g_setting.oneLineBreadcrumb && !isCardPage) {
        const elem = protyleElem.querySelector(`.protyle-breadcrumb__bar`);
        if (elem) {
            elem.insertAdjacentElement("beforebegin", finalElement);
        }else{
            debugPush("可能是由于没有焦点不再文档上");
        }
    }else{
        const elem = protyleElem.querySelector(`.protyle-breadcrumb`);
        if (elem) {
            elem.insertAdjacentElement("beforebegin",finalElement);
        } else {
            debugPush("可能是由于焦点不在文档上");
        }
    }
    // 修改长度
    let isAdjustFinished = false;
    // 面包屑项
    const itemElements = finalElement.querySelectorAll(".protyle-breadcrumb__item ");
    while (finalElement.scrollHeight > 30 && !isAdjustFinished && itemElements.length > 2) {
        [].find.call(itemElements, ((item, index) => {
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
    finalElement.firstChild.classList.add("protyle-breadcrumb__bar--nowrap");

    debugPush("重写面包屑成功");
    // v0.2.10应该是修改为仅范围内生效了，不再需要remove了
    [].forEach.call(protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container .fake-breadcrumb-click[data-og-type="FILE"]`), (elem)=>{
        elem.addEventListener("mouseup", openRefLinkAgent.bind(null, "FILE", protyleElem));
    });
    [].forEach.call(protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container .fake-breadcrumb-click[data-og-type="NOTEBOOK"]`), (elem)=>{
        elem.addEventListener("mouseup", openRefLinkAgent.bind(null, "NOTEBOOK", protyleElem));
    });
    [].forEach.call(protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container .fake-breadcrumb-click[data-og-type="..."]`), (elem)=>{
        elem.addEventListener("click", openHideMenu.bind(null, protyleElem));
    });
    [].forEach.call(protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container .${CONSTANTS.ARROW_SPAN_NAME}[data-og-type="FILE"], .og-fake-doc-breadcrumb-container .${CONSTANTS.ARROW_SPAN_NAME}[data-og-type="NOTEBOOK"]`), (elem)=>{
        elem.addEventListener("click", openRelativeMenu.bind(null, protyleElem));
    });
    [].forEach.call(protyleElem.querySelectorAll(`.og-fake-doc-breadcrumb-container .protyle-breadcrumb__bar`), (elem)=>{
        elem.addEventListener("mousewheel", scrollConvert.bind(null, elem), true);
    });
    // setDisplayHider();
    
    function scrollConvert(elem, event) {
        elem.scrollLeft = elem.scrollLeft + event.deltaY;
    }
}

function openRefLinkAgent(type, protyleElem, event) {
    event.preventDefault();
    event.stopPropagation();
    if (g_setting.swapClickFunction) {
        if (event.button == 2 && type === "FILE") {
            openRefLink(event, null, null, protyleElem);
        } else if (event.button != 2) {
            openRelativeMenu(protyleElem, event);
        }
    } else {
        if (event.button == 2) {
            openRelativeMenu(protyleElem, event);
        } else if (type == "FILE") {
            openRefLink(event, null, null, protyleElem);
        }
    }
}

function openHideMenu(protyleElem, event) {
    let ids = JSON.parse(event.currentTarget.getAttribute("data-node-id").replaceAll(`'`, `"`));
    let names = JSON.parse(event.currentTarget.getAttribute("data-node-names").replaceAll(`'`, `"`));
    let rect = event.currentTarget.getBoundingClientRect();
    event.stopPropagation();
    event.preventDefault();
    const tempMenu = new siyuan.Menu("newMenu");
    for (let i = 0; i < ids.length; i++) {
        let id = ids[i];
        let name = names[i];
        let trimedName = name.length > g_setting.nameMaxLength ? 
            name.substring(0, g_setting.nameMaxLength) + "..."
            : name;
        let tempMenuItemObj = {
            iconHTML: "",
            label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}" 
                data-doc-id="${id}"
                title="${name}">
                ${trimedName}
            </span>`,
            click: (event)=>{
                let docId = event.querySelector("[data-doc-id]")?.getAttribute("data-doc-id")
                openRefLink(undefined, docId, {
                    ctrlKey: event?.ctrlKey,
                    shiftKey: event?.shiftKey,
                    altKey: event?.altKey,
                    metaKey: event?.metaKey,
                }, protyleElem);
            }
        }
        tempMenu.addItem(tempMenuItemObj);
    }

    tempMenu.open({x: rect.left, y: rect.bottom,isLeft:false});
}
/**
 * 打开相关文档菜单
 * @param {HTMLElement} protyleElem 
 * @param {Event} event 
 * @returns 
 */
async function openRelativeMenu(protyleElem, event) {
    const maxDepth = g_setting["menuExtendSubDocDepth"];
    let id = event.currentTarget.getAttribute("data-parent-id") ?? event.currentTarget.getAttribute("data-node-id");
    let nextId = event.currentTarget.getAttribute("data-next-id");
    let thisPath = event.currentTarget.getAttribute("data-og-path");
    let box = event.currentTarget.getAttribute("data-og-box");
    let rect = event.currentTarget.getBoundingClientRect();
    if (!event.currentTarget.classList.contains("og-fake-doc-breadcrumb-arrow-span") && event.currentTarget.nextElementSibling) {
        rect = event.currentTarget.nextElementSibling.getBoundingClientRect();
    }
    event.stopPropagation();
    event.preventDefault();
    if (g_relativeMenu) {
        let tempId = g_relativeMenu["id"];
        if (tempId === id && document.querySelector("#commonMenu[data-name='og-fdb-relative-menu']")) {
            g_relativeMenu["menu"]?.close();
            g_relativeMenu = null;
            return;
        }
        g_relativeMenu["menu"]?.close();
        g_relativeMenu = null;
    }
    
    let sqlResult = [{
        path: thisPath,
        box: box
    }];
    let siblings = await getChildDocuments(id, sqlResult);
    if (siblings.length <= 0) return;
    
    const tempMenu = new siyuan.Menu("og-fdb-relative-menu");
    
    // 本层级内容
    for (let i = 0; i < siblings.length; i++) {
        let currSibling = siblings[i];
        let docName = currSibling.name.endsWith(".sy") ? currSibling.name.substring(0, currSibling.name.length - 3) : currSibling.name;
        let trimedName = docName.length > g_setting.nameMaxLength ? 
            docName.substring(0, g_setting.nameMaxLength) + "..."
            : docName;
        let tempMenuItemObj = {
            iconHTML: getEmojiHtmlStr(currSibling.icon, currSibling.subFileCount > 0),
            label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME} ${nextId == currSibling.id ? CONSTANTS.MENU_CURRENT_DOC_CLASS_NAME : ""}" 
                data-doc-id="${currSibling.id}"
                title="${docName}">
                ${trimedName}
            </span>`,
            accelerator: nextId == currSibling.id ? "<-" : undefined,
            current: nextId == currSibling.id
        };
        
        if (currSibling.icon && currSibling.icon !== "" && currSibling.icon.indexOf(".") === -1) {
            tempMenuItemObj["icon"] = `icon-${currSibling.icon}`;
        }
        
        // 对于带有子层级的文档，另外处理，主要是一些参数
        if (currSibling.subFileCount > 0 && maxDepth > 1) {
            tempMenuItemObj.type = "submenu";
            tempMenuItemObj.submenu = [
                {
                    label: language["loading"],
                    disabled: true
                }
            ];
            
            tempMenuItemObj.label = `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME} ${nextId == currSibling.id ? CONSTANTS.MENU_CURRENT_DOC_CLASS_NAME : ""}" 
                data-doc-id="${currSibling.id}"
                data-has-children="true"
                data-path="${currSibling.path || ''}"
                data-box="${box}"
                data-loaded="false"
                title="${docName}">
                ${trimedName}
            </span>`;
        }
        tempMenuItemObj.click = (event) => {
            let docId = event.querySelector("[data-doc-id]")?.getAttribute("data-doc-id");
            openRefLink(undefined, docId, {
                ctrlKey: event?.ctrlKey,
                shiftKey: event?.shiftKey,
                altKey: event?.altKey,
                metaKey: event?.metaKey,
            }, protyleElem);
            g_relativeMenu["menu"]?.close();
            g_relativeMenu = null;
        };
        tempMenu.addItem(tempMenuItemObj);
    }
    // 菜单展示位置调整，仅针对首层级
    if (siblings.length * 30 > (window.innerHeight - rect.bottom) * 0.7) {
        tempMenu.open({x: rect.right, y: rect.top, isLeft: false});
    } else {
        tempMenu.open({x: rect.left, y: rect.bottom, isLeft: false});
    }
    setTimeout(() => {
        if (g_setting.menuKeepCurrentVisible) {
            tempMenu.element.querySelector('.b3-menu__item--selected')?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
        }
        
        // 懒加载
        if (g_setting.menuExtendSubDocDepth > 1) {
            addLazyLoadEventListeners(tempMenu.element, maxDepth, protyleElem);
        }
    }, 3);
    
    g_relativeMenu = {"menu": tempMenu, "id": id};
}

/**
 * 对带有子菜单的添加懒加载
 * @param {HTMLElement} menuElement 菜单元素
 * @param {number} maxDepth 最大深度
 * @param {HTMLElement} protyleElem protyle Elem
 * @param {number} currentDepth 层级深度
 */
function addLazyLoadEventListeners(menuElement, maxDepth, protyleElem, currentDepth = 1) {
    // 仅针对未加载的进行处理
    const menuItems = menuElement.querySelectorAll('.b3-menu__item [data-has-children="true"][data-loaded="false"]');
    
    menuItems.forEach(item => {
        const menuItemElement = item.closest('.b3-menu__item');
        if (!menuItemElement) return;
        
        // 悬停加载
        menuItemElement.addEventListener('mouseover', async function handleMouseOver(e) {
            const docId = item.getAttribute('data-doc-id');
            const path = item.getAttribute('data-path');
            const box = item.getAttribute('data-box');
            const isLoaded = item.getAttribute('data-loaded') === 'true';
            
            if (isLoaded || currentDepth >= maxDepth) return;
            
            // 避免多次处理
            item.setAttribute('data-loaded', 'true');
            
            const submenuContainer = menuItemElement.querySelector('.b3-menu__submenu .b3-menu__items');
            if (!submenuContainer) return;
            
            submenuContainer.innerHTML = '';
            
            // 加载子文档
            const sqlResult = [{ path, box }];
            const childDocuments = await getChildDocuments(docId, sqlResult);
            
            if (!childDocuments || childDocuments.length === 0) {
                submenuContainer.innerHTML = `<button class="b3-menu__item" disabled><span class="b3-menu__label">${language["no_doc"]}</span></button>`;
                return;
            }
            
            // 子文档菜单
            for (const childDoc of childDocuments) {
                const docName = childDoc.name.endsWith(".sy") ? 
                    childDoc.name.substring(0, childDoc.name.length - 3) : 
                    childDoc.name;
                    
                const trimedName = docName.length > g_setting.nameMaxLength ? 
                    docName.substring(0, g_setting.nameMaxLength) + "..." : 
                    docName;
                const hasChildren = childDoc.subFileCount > 0 && (currentDepth + 1) < maxDepth;
                
                // Menu Item
                const menuItemEl = document.createElement('button');
                menuItemEl.className = 'b3-menu__item';
                if (hasChildren) {
                    menuItemEl.classList.add('b3-menu__item--custom');
                }
                
                // Emoji
                const emojiEl = document.createElement('span');
                emojiEl.className = 'og-fdb-menu-emojitext';
                emojiEl.innerHTML = getEmojiHtmlStr(childDoc.icon, childDoc.subFileCount > 0);
                menuItemEl.appendChild(emojiEl);
                
                // label
                const labelEl = document.createElement('span');
                labelEl.className = 'b3-menu__label';
                
                // title
                const docTitleEl = document.createElement('span');
                docTitleEl.className = `${CONSTANTS.MENU_ITEM_CLASS_NAME}`;
                docTitleEl.setAttribute('data-doc-id', childDoc.id);
                docTitleEl.setAttribute('title', docName);
                
                if (hasChildren) {
                    docTitleEl.setAttribute('data-has-children', 'true');
                    docTitleEl.setAttribute('data-path', childDoc.path || '');
                    docTitleEl.setAttribute('data-box', box);
                    docTitleEl.setAttribute('data-loaded', 'false');
                }
                
                docTitleEl.textContent = trimedName;
                labelEl.appendChild(docTitleEl);
                menuItemEl.appendChild(labelEl);
                
                // 子文档的子文档
                if (hasChildren) {
                    // > icon
                    // svg里的use，使用带namespace的才能够正确创建一个有效的use箭头
                    const svgNS = 'http://www.w3.org/2000/svg';

                    const arrowIcon = document.createElementNS(svgNS, 'svg');
                    arrowIcon.setAttribute('class', 'b3-menu__icon b3-menu__icon--small');

                    const use = document.createElementNS(svgNS, 'use');
                    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#iconRight');

                    arrowIcon.appendChild(use);
                    menuItemEl.appendChild(arrowIcon);
                    
                    // 子文档容器
                    const submenuDiv = document.createElement('div');
                    submenuDiv.className = 'b3-menu__submenu';
                    
                    const submenuItems = document.createElement('div');
                    submenuItems.className = 'b3-menu__items';
                    
                    // 加载中……
                    const loadingItem = document.createElement('button');
                    loadingItem.className = 'b3-menu__item';
                    loadingItem.disabled = true;
                    loadingItem.innerHTML = '<span class="b3-menu__label">Loading...</span>';
                    submenuItems.appendChild(loadingItem);
                    
                    submenuDiv.appendChild(submenuItems);
                    menuItemEl.appendChild(submenuDiv);
                }
                menuItemEl.addEventListener('click', (event) => {
                    const docId = docTitleEl.getAttribute('data-doc-id');
                    openRefLink(undefined, docId, {
                        ctrlKey: event?.ctrlKey,
                        shiftKey: event?.shiftKey,
                        altKey: event?.altKey,
                        metaKey: event?.metaKey,
                    }, protyleElem);
                    // 手动绑定的不能触发菜单关闭，这里自行处理一下
                    g_relativeMenu["menu"]?.close();
                    g_relativeMenu = null;
                });
                submenuContainer.appendChild(menuItemEl);
            }
            
            // 对子Menu再度绑定
            addLazyLoadEventListeners(submenuContainer, maxDepth, protyleElem, currentDepth + 1);
        });
    });
}


function getNotebooks() {
    let notebooks = window.top.siyuan.notebooks;
    return notebooks;
}


async function getCurrentDocDetail(docId, protyle) {
    let result = {
        path: protyle.path,
        hpath: await getHPathByID(docId),
        box: protyle.notebookId,
        docId: protyle.block.rootID
    }
    return result;
}

async function getHPathByID(docId) {
    let url = "/api/filetree/getHPathByID";
    let data = {
        id: docId
    }
    return parseBody(request(url, data));
}

async function listDocTree(notebook, path) {
    const url = "/api/filetree/listDocTree";
    let postBody = {
        notebook,
        path
    }
    let response = await postRequest(postBody, url);
    if (response.code == 0) {
        return response.data.tree;
    } else {
        throw new Error("listDocTree Failed: " + response.msg);
    }
}

async function getChildDocuments(docId, sqlResult) {
    let childDocs = await listDocsByPath({path: sqlResult[0].path, notebook: sqlResult[0].box});
    if (childDocs.files.length > g_setting.docMaxNum && g_setting.docMaxNum != 0) {
        childDocs.files = childDocs.files.slice(0, g_setting.docMaxNum);
    }
    return childDocs.files;
}

function setMouseKeyboardListener() {
    if (g_setting.typeHide) {
        window.document.addEventListener("mousemove", showDocBreadcrumb);
        window.document.addEventListener("keydown", hideDocBreadcrumb, true);
    }
}

function hideDocBreadcrumb(event) {
    if (!g_hidedBreadcrumb) {
        if (event.ctrlKey || event.shiftKey || event.altKey) return;
        const fakeBreadcrumb = window.document.querySelectorAll(`.${CONSTANTS.CONTAINER_CLASS_NAME}`);
        [].forEach.call(fakeBreadcrumb, (e)=>{
            e.classList.add("og-hide-breadcrumb");
        });
        g_hidedBreadcrumb = true;
    }
}

function showDocBreadcrumb() {
    if (g_hidedBreadcrumb) {
        const fakeBreadcrumb = window.document.querySelectorAll(`.${CONSTANTS.CONTAINER_CLASS_NAME}`);
        [].forEach.call(fakeBreadcrumb, (e)=>{
            e.classList.remove("og-hide-breadcrumb");
        });
        g_hidedBreadcrumb = false;
    }
}

function removeMouseKeyboardListener() {
    window.document.removeEventListener("mousemove", showDocBreadcrumb);
    window.document.removeEventListener("keydown", hideDocBreadcrumb, true);
}

function setStyle() {
    // let contentElem = window.top.document.querySelector(`.fn__flex-1.protyle .protyle-content`);
    // let contentPaddingTop = parseFloat(window.getComputedStyle(contentElem)?.getPropertyValue("padding-top")?.replace("px")??30);
    // debugPush(contentPaddingTop);
    // let newPaddingTop = contentPaddingTop + window.document.querySelector(`.fn__flex-1.protyle .protyle-breadcrumb`)?.clientHeight ?? 30;
    // debugPush("new padding top", newPaddingTop);

    const head = document.getElementsByTagName('head')[0];
    const style = document.createElement('style');
    style.setAttribute("id", CONSTANTS.STYLE_ID);
    style.innerHTML = `
    /*#commonMenu[data-name='og-fdb-relative-menu'] .b3-menu__items {
        max-height: 60vh;
    }*/
    .og-breadcrumb-oneline {
        margin-right: 3px;
        overflow-x: auto; /* 滚动查看，oneline套了一层div所以也得加overflow */
        flex-shrink: 0.5; /* 块面包屑过长时避免大范围占用文档面包屑 */
    }

    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item[data-og-type="NOTEBOOK"] {
        cursor: default;
        /*pointer-events: none;*/
    }

    .og-fdb-menu-emojitext, .og-fdb-menu-emojipic {
        align-self: center;
        height: 14px;
        width: 14px;
        line-height: 14px;
        margin-right: 8px;
        flex-shrink: 0;
    }

    .og-fdb-bread-emojitext, .og-fdb-bread-emojipic {
        align-self: center;
        height: 14px;
        width: 14px;
        line-height: 14px;
        margin-right: 8px;
        flex-shrink: 0;
    }

    .b3-menu__item  img.og-fdb-menu-emojipic {
        width: 16px;
        height: 16px;
    }
    
    .${CONSTANTS.CONTAINER_CLASS_NAME} .protyle-breadcrumb__text {
        margin-left: 0px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .og-fake-doc-breadcrumb-container.protyle-breadcrumb {
        padding-bottom: 0px;
    }

    .protyle-breadcrumb__bar protyle-breadcrumb__bar--nowrap

    .${CONSTANTS.CONTAINER_CLASS_NAME} {
        display: block !important;
    }

    .og-fake-doc-breadcrumb-arrow-span[data-og-type=FILE], .og-fake-doc-breadcrumb-arrow-span[data-og-type=NOTEBOOK] {
        cursor: pointer;
    }
    /* 上下错位调整，以及增大触发范围 */
    .og-fake-doc-breadcrumb-arrow-span {
        height: 24px;
        border-radius: var(--b3-border-radius);
        display: flex;
        align-items: center;
    }

    .og-hide-breadcrumb {
        opacity: 0;
        transition: 1s;
    }

    .og-fake-doc-breadcrumb-arrow {
        height: 10px;
        width: 10px;
        color: var(--b3-theme-on-surface-light);
        margin: 0 4px;
        flex-shrink: 0
    }
    /* savor 样式兼容 */
    svg.og-fake-doc-breadcrumb-arrow.protyle-breadcrumb__arrow {
        border: none;
        transform: none;
    }

    .og-fake-doc-breadcrumb-arrow-span:hover {
        color: var(--b3-theme-on-background);
        background-color: var(--b3-list-hover);
    }

    .og-fake-doc-breadcrumb-arrow-span:hover > .og-fake-doc-breadcrumb-arrow {
        color: var(--b3-menu-highlight-color);
        background-color: var(--b3-menu-highlight-background);
    }
    /*移动端样式*/
    .og-fdb-mobile-btn-class {
        max-width: 60%;
        overflow: auto;
        display: flex;
    }

    .og-fdb-mobile-btn-path {
        max-width: 6em;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .og-fdb-mobile-btn-path-folded {

    }
    /* 覆盖savor主题样式 */
    .og-fake-doc-breadcrumb-container.protyle-breadcrumb>.protyle-breadcrumb__bar .protyle-breadcrumb__item:first-child::before {
        content: "";
        margin-right: 0px;
    }

    .og-fake-doc-breadcrumb-ellipsis {
        max-width: 112px;
    }
    `;
    head.appendChild(style);
}

function styleEscape(str) {
    return str.replace(new RegExp("<[^<]*style[^>]*>", "g"), "");
}

function removeStyle() {
    document.getElementById(CONSTANTS.STYLE_ID)?.remove();
}

/*** Utils ***/


function isSomePluginExist(pluginList, checkPluginName) {
    for (const plugin of pluginList) {
        if (checkPluginName.includes(plugin.name)) {
            return true;
        }
    }
    return false;
}

/**
 * 在html中显示文档icon
 * @param {*} iconString files[x].icon
 * @param {*} hasChild 
 * @param {str} textClassName 文本的span class名称
 * @param {str} picClassName 图片img class名称
 * @param {boolean} wrapText 将文本使用text包裹
 * @param {boolean} wrapBlank 即使按照设置并没有图标，也使用span包裹图标
 * @returns 
 */
function getEmojiHtmlStr(iconString, hasChild, textClassName="og-fdb-menu-emojitext", picClassName="og-fdb-menu-emojipic", wrapText=true, wrapBlank=true) {
    if (g_setting.icon == CONSTANTS.ICON_NONE) return ``;
    // 无emoji的处理
    if ((iconString == undefined || iconString == null ||iconString == "") && g_setting.icon == CONSTANTS.ICON_ALL) {
        if (window.siyuan.storage["local-images"]) {
            if (hasChild) {
                return getEmojiHtmlStr(window.siyuan.storage["local-images"].folder, hasChild, textClassName, picClassName, wrapText);
            } else {
                return getEmojiHtmlStr(window.siyuan.storage["local-images"].file, hasChild, textClassName, picClassName, wrapText);
            }
        }
        if (hasChild) {
            if (wrapText) {
                return `<span class="${textClassName}">📑</span>`;        
            } else {
                return "📑";
            }
        } else {
            if (wrapText) {
                return `<span class="${textClassName}">📄</span>`;
            } else {
                return "📄";
            }
        }
    }
    if ((iconString == undefined || iconString == null ||iconString == "") && g_setting.icon == CONSTANTS.ICON_CUSTOM_ONLY) {
        if (wrapBlank) {
            return `<span class="${textClassName}"></span>`;
        } else {
            return "";
        }
    }
    let result = iconString;
    // emoji地址判断逻辑为出现.，但请注意之后的补全
    if (iconString.startsWith("api/icon/getDynamicIcon")) {
        result = `<img class="${picClassName}" src="/${iconString}"/>`;
    } else if (iconString.indexOf(".") != -1) {
        result = `<img class="${picClassName}" src="/emojis/${iconString}"/>`;
    } else {
        if (wrapText) {
            result = `<span class="${textClassName}">${emojiIconHandler(iconString, hasChild)}</span>`;
        } else {
            result = emojiIconHandler(iconString, hasChild);
        }
    }
    return result;
}
let emojiIconHandler = function (iconString, hasChild = false) {
    //确定是emojiIcon 再调用，printer自己加判断
    try {
        let result = "";
        iconString.split("-").forEach(element => {
            result += String.fromCodePoint("0x" + element);
        });
        return result;
    } catch (err) {
        errorPush("emoji处理时发生错误", iconString, err);
        return hasChild ? "📑" : "📄";
    }
}

function getAllShowingDocId() {
    if (isMobile()) {
        return [getCurrentDocIdF()];
    } else {
        const elemList = window.document.querySelectorAll("[data-type=wnd] .protyle.fn__flex-1:not(.fn__none) .protyle-background");
        const result = [].map.call(elemList, function(elem) {
            return elem.getAttribute("data-node-id");
        });
        return result
    }
}

function getCurrentDocIdF() {
    let thisDocId = null;
    thisDocId = window.top.document.querySelector(".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
    debugPush("thisDocId by first id", thisDocId);
    let temp = null;
    if (!thisDocId && isMobile()) {
        // UNSTABLE: 面包屑样式变动将导致此方案错误！
        try {
            temp = window.top.document.querySelector(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]")?.getAttribute("data-id");
            let iconArray = window.top.document.querySelectorAll(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]");
            for (let i = 0; i < iconArray.length; i++) {
                let iconOne = iconArray[i];
                if (iconOne.children.length > 0 
                    && iconOne.children[0].getAttribute("xlink:href") == "#iconFile"){
                    temp = iconOne.getAttribute("data-id");
                    break;
                }
            }
            thisDocId = temp;
        }catch(e){
            console.error(e);
            temp = null;
        }
    }
    if (!thisDocId) {
        thisDocId = window.top.document.querySelector(".protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
        debugPush("thisDocId by background must match,  id", thisDocId);
    }
    return thisDocId;
}
async function request(url, data) {
    let resData = null;
    await fetch(url, {
        body: JSON.stringify(data),
        method: 'POST'
    }).then(function (response) {
        resData = response.json();
    });
    return resData;
}

async function parseBody(response) {
    let r = await response;
    return r.code === 0 ? r.data : null;
}

async function pushMsg(msg, timeout = 4500) {
    let url = '/api/notification/pushMsg';
    let data = {
        "msg": msg,
        "timeout": timeout
    }
    return parseBody(request(url, data));
}

async function getDocInfo(docId) {
    let url = `/api/block/getDocInfo`;
    return parseBody(request(url, {id: docId}));
}

async function listDocsByPath({path, notebook = undefined, sort = undefined, maxListLength = undefined}) {
    let data = {
        path: path,
        "ignoreMaxListHint": true
    };
    if (notebook) data["notebook"] = notebook;
    if (sort) data["sort"] = sort;
    if (g_setting.docMaxNum != 0) {
        data["maxListCount"] = g_setting.docMaxNum >= 32 ? g_setting.docMaxNum : 32;
    } else {
        data["maxListCount"] = 0;
    }
    let url = '/api/filetree/listDocsByPath';
    return parseBody(request(url, data));
    //文档hepath与Markdown 内容
}

async function sqlAPI(stmt) {
    let data = {
        "stmt": stmt
    };
    let url = `/api/query/sql`;
    return parseBody(request(url, data));
}

/**
 * 在点击<span data-type="block-ref">时打开思源块/文档
 * 为引入本项目，和原代码相比有更改
 * @refer https://github.com/leolee9086/cc-template/blob/6909dac169e720d3354d77685d6cc705b1ae95be/baselib/src/commonFunctionsForSiyuan.js#L118-L141
 * @license 木兰宽松许可证
 * @param {点击事件} event
 * @param {string} docId，此项仅在event对应的发起Elem上找不到data node id的情况下使用
 * @param {keyParam} keyParam event的Key，主要是ctrlKey shiftKey等，此项仅在event无效时使用
 * @param {protyle} protyleElem 如果不为空打开文档点击事件将在该Elem上发起
 * @param {boolean} openInFocus 在当前聚焦的窗口中打开，给定此项为true，则优于protyle选项生效
 */
function openRefLink(event, paramId = "", keyParam = undefined, protyleElem = undefined, openInFocus = !g_setting.preferOpenInCurrentSplit){
    let 主界面= window.parent.document
    let id;
    if (event && event.currentTarget && event.currentTarget.getAttribute("data-node-id")) {
        id = event.currentTarget.getAttribute("data-node-id");
    }else{
        id = paramId;
    }
    // 处理笔记本等无法跳转的情况
    if (!isValidStr(id)) {return;}
    event?.preventDefault();
    event?.stopPropagation();
    debugPush("openRefLinkEvent", event);
    let 虚拟链接 =  主界面.createElement("span")
    虚拟链接.setAttribute("data-type","a")
    虚拟链接.setAttribute("data-href", "siyuan://blocks/" + id)
    虚拟链接.style.display = "none";//不显示虚拟链接，防止视觉干扰
    let 临时目标 = null;
    // 如果提供了目标protyle，在其中插入
    if (protyleElem && !openInFocus) {
        临时目标 = protyleElem.querySelector(".protyle-wysiwyg div[data-node-id] div[contenteditable]") ?? protyleElem;
        debugPush("openRefLink使用提供窗口", 临时目标);
    }
    debugPush("openInFocus?", openInFocus);
    if (openInFocus) {
        // 先确定Tab
        const dataId = 主界面.querySelector(".layout__wnd--active .layout-tab-bar .item--focus")?.getAttribute("data-id");
        debugPush("openRefLink尝试使用聚焦窗口", dataId);
        // 再确定Protyle
        if (isValidStr(dataId)) {
            临时目标 = window.document.querySelector(`.fn__flex-1.protyle[data-id='${dataId}']
            .protyle-wysiwyg div[data-node-id] div[contenteditable]`);
            debugPush("openRefLink使用聚焦窗口", 临时目标);
        }
    }
    if (!isValidStr(临时目标)) {
        临时目标 = 主界面.querySelector(".protyle-wysiwyg div[data-node-id] div[contenteditable]");
        debugPush("openRefLink未能找到指定窗口，更改为原状态");
    }
    临时目标.appendChild(虚拟链接);
    let clickEvent = new MouseEvent("click", {
        ctrlKey: event?.ctrlKey ?? keyParam?.ctrlKey,
        shiftKey: event?.shiftKey ?? keyParam?.shiftKey,
        altKey: event?.altKey ?? keyParam?.altKey,
        metaKey: event?.metaKey ?? keyParam?.metaKey,
        bubbles: true
    });
    window.getSelection()?.removeAllRanges();
    虚拟链接.dispatchEvent(clickEvent);
    虚拟链接.remove();
}

function isValidStr(s){
    if (s == undefined || s == null || s === '') {
		return false;
	}
	return true;
}

let zh_CN = {
    "setting_nameMaxLength_name": "文档名最大长度",
    "setting_nameMaxLength_desp": "文档名超出的部分将被删除。设置为0则不限制。",
    "setting_docMaxNum_name": "文档最大数量",
    "setting_docMaxNum_desp": "当子文档或同级文档超过该值时，后续文档将不再显示。设置为0则不限制。",
    "error_initFailed": "文档面包屑插件初始化失败，如果可以，请向开发者反馈此问题",
    "setting_panel_title": "文档面包屑插件设置",
}

let language = zh_CN;

/**
 * 由需要的设置项生成设置页面
 * @param {*} settingObject 
 */
function generateSettingPanelHTML(settingObjectArray) {
    let resultHTML = "";
    for (let oneSettingProperty of settingObjectArray) {
        let inputElemStr = "";
        oneSettingProperty.desp = oneSettingProperty.desp?.replace(new RegExp("<code>", "g"), "<code class='fn__code'>");
        if (oneSettingProperty.name.includes("🧪")) {
            oneSettingProperty.desp = language["setting_experimental"] + oneSettingProperty.desp;
        }
        const tempElem = document.createElement("label");
        tempElem.classList.add("fn__flex", "b3-label");
        const inLabelDiv = document.createElement("div");
        inLabelDiv.classList.add("fn__flex-1");
        inLabelDiv.innerText = oneSettingProperty.name;

        const descriptionElement = document.createElement('div');
        descriptionElement.classList.add('b3-label__text');
        descriptionElement.textContent = oneSettingProperty.desp ?? "";
        inLabelDiv.appendChild(descriptionElement);
        
        let temp = `
        <label class="fn__flex b3-label">
            <div class="fn__flex-1">
                ${oneSettingProperty.name}
                <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
            </div>
            <span class="fn__space"></span>
            *#*##*#*
        </label>
        `;
        switch (oneSettingProperty.type) {
            case "NUMBER": {
                let min = oneSettingProperty.limit[0];
                let max = oneSettingProperty.limit[1];
                inputElemStr = `<input 
                    class="b3-text-field fn__flex-center fn__size200" 
                    id="${oneSettingProperty.id}" 
                    type="number" 
                    name="${oneSettingProperty.simpId}"
                    ${min == null || min == undefined ? "":"min=\"" + min + "\""} 
                    ${max == null || max == undefined ? "":"max=\"" + max + "\""} 
                    value="${oneSettingProperty.value}">`;
                break;
            }
            case "SELECT": {

                let optionStr = "";
                for (let option of oneSettingProperty.limit) {
                    let optionName = option.name;
                    if (!optionName) {
                        optionName = language[`setting_${oneSettingProperty.simpId}_option_${option.value}`];
                    }
                    optionStr += `<option value="${option.value}" 
                    ${option.value == oneSettingProperty.value ? "selected":""}>
                        ${optionName}
                    </option>`;
                }
                inputElemStr = `<select 
                    id="${oneSettingProperty.id}" 
                    name="${oneSettingProperty.simpId}"
                    class="b3-select fn__flex-center fn__size200">
                        ${optionStr}
                    </select>`;
                break;
            }
            case "TEXT": {
                inputElemStr = `<input class="b3-text-field fn__flex-center fn__size200" id="${oneSettingProperty.id}" name="${oneSettingProperty.simpId}" value="${oneSettingProperty.value}"></input>`;
                temp = `
                <label class="fn__flex b3-label config__item">
                    <div class="fn__flex-1">
                        ${oneSettingProperty.name}
                        <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
                    </div>
                    *#*##*#*
                </label>`
                break;
            }
            case "SWITCH": {
                inputElemStr = `<input 
                class="b3-switch fn__flex-center"
                name="${oneSettingProperty.simpId}"
                id="${oneSettingProperty.id}" type="checkbox" 
                ${oneSettingProperty.value?"checked=\"\"":""}></input>
                `;
                break;
            }
            case "TEXTAREA": {
                inputElemStr = `<textarea 
                name="${oneSettingProperty.simpId}"
                class="b3-text-field fn__block" 
                id="${oneSettingProperty.id}">${oneSettingProperty.value}</textarea>`;
                temp = `
                <label class="b3-label fn__flex">
                    <div class="fn__flex-1">
                        ${oneSettingProperty.name}
                        <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
                        <div class="fn__hr"></div>
                        *#*##*#*
                    </div>
                </label>`
                break;
            }
            case "HINT": {
                inputElemStr = ``;
                break;
            }
        }
        
        resultHTML += temp.replace("*#*##*#*", inputElemStr);
    }
    // console.log(resultHTML);
    return resultHTML;
}

/**
 * 由设置界面读取配置
 */
function loadUISettings(formElement) {
    let data = new FormData(formElement);
    // 扫描标准元素 input[]
    let result = {};
    for(const [key, value] of data.entries()) {
        // console.log(key, value);
        result[key] = value;
        if (value === "on") {
            result[key] = true;
        }else if (value === "null" || value == "false") {
            result[key] = "";
        }
    }
    let checkboxes = formElement.querySelectorAll('input[type="checkbox"]');
    for (let i = 0; i < checkboxes.length; i++) {
        let checkbox = checkboxes[i];
        // console.log(checkbox, checkbox.name, data[checkbox.name], checkbox.name);
        if (result[checkbox.name] == undefined) {
            result[checkbox.name] = false;
        }
    }

    let numbers = formElement.querySelectorAll("input[type='number']");
    // console.log(numbers);
    for (let number of numbers) {
        let minValue = number.getAttribute("min");
        let maxValue = number.getAttribute("max");
        let value = parseFloat(number.value);

        if (minValue !== null && value < parseFloat(minValue)) {
            number.value = minValue;
            result[number.name] = parseFloat(minValue);
        } else if (maxValue !== null && value > parseFloat(maxValue)) {
            number.value = maxValue;
            result[number.name] = parseFloat(maxValue);
        } else {
            result[number.name] = value;
        }
    }

    debugPush("UI SETTING", result);
    return result;
}

function isMobile() {
    return window.top.document.getElementById("sidebar") ? true : false;
};


module.exports = {
    default: FakeDocBreadcrumb,
};