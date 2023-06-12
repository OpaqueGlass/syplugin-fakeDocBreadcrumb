/**
 * 
 */
const siyuan = require('siyuan');

/**
 * 全局变量
 */
let g_switchTabObserver; // 页签切换与新建监视器
let g_windowObserver; // 窗口监视器
let g_displayHideTimeout; // 显示/消失监视器
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
    ARROW_CLASS_NAME: "og-fake-doc-breadcrumb-arrow",
    MENU_ITEM_CLASS_NAME: "og-fake-doc-breadcrumb-menu-item-container",
    SIBLING_CONTAINER_ID: "og-fake-doc-breadcrumb-sibling-doc-container",
    INDICATOR_CLASS_NAME: "og-fake-doc-breadcrumb-doc-indicator",
    POP_NONE: 0,
    POP_LIMIT: 1,
    POP_ALL: 2,
    MAX_NAME_LENGTH: 15,
}
let g_observerRetryInterval;
let g_observerStartupRefreshTimeout;
let g_initRetryInterval;
let g_initFailedMsgTimeout;
let g_TIMER_LABLE_NAME_COMPARE = "文档面包屑插件";
let g_tabbarElement = undefined;
let g_saveTimeout;
let g_writeStorage;
let g_isMobile = false;
let g_hidedBreadcrumb = false;
let g_setting = {
    "nameMaxLength": null,
    "docMaxNum": null,
    "showNotebook": null,
    "typeHide": null,
    "foldedFrontShow": null,
    "foldedEndShow": null,
};
let g_setting_default = {
    "nameMaxLength": 15,
    "docMaxNum": 128,
    "showNotebook": true,
    "typeHide": false,
    "foldedFrontShow": 2,
    "foldedEndShow": 3,
};
/**
 * Plugin类
 */
class FakeDocBreadcrumb extends siyuan.Plugin {

    tabOpenObserver =  null;

    onload() {
        // 设置语言
        try {
            g_tabbarElement = window.siyuan.layout.centerLayout.element.querySelectorAll("[data-type='wnd'] ul.layout-tab-bar");
        }catch(err) {
            console.log(`og-fdb启动测试未通过`);
            g_tabbarElement = undefined;
        }
        if (g_tabbarElement == undefined) {
            g_isMobile = true;
        }
        g_isMobile = isMobile();
        // ~~若思源设定非中文，则显示英文~~
        // let siyuanLanguage;
        // try{
        //     siyuanLanguage = window.top.siyuan.config.lang;
        // }catch (err){
        //     warnPush("读取语言信息失败");
        // }
        // if (siyuanLanguage != "zh_CN" && siyuanLanguage != undefined) {
        //     language = en_US;
        // }else {
        //     language = zh_CN;
        // }
        language = this.i18n;
        // 读取配置
        // TODO: 读取配置API变更
        Object.assign(g_setting, g_setting_default);
        let bodyElem = window.document.getElementsByTagName("body");
        g_initFailedMsgTimeout = setTimeout(()=>{
            clearInterval(g_initRetryInterval);
            pushMsg(language["error_initFailed"]);
        }, 90000);
        
        this.loadData("settings.json").then((settingCache)=>{
            // 解析并载入配置
            try {
                debugPush("载入配置中",settingCache);
                // let settingData = JSON.parse(settingCache);
                Object.assign(g_setting, settingCache);
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
                g_initRetryInterval = setInterval(initRetry, 2500);
            // }
        }, (e)=> {
            warnPush("配置文件读入失败", e);
        });

        g_writeStorage = this.saveData;
        
        debugPush('FakeDocBradcrumbPluginInited',this.i18n, language);
    }

    onunload() {
        this.el && this.el.remove();
        removeObserver();
        removeStyle();
        removeMouseKeyboardListener();
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
            "height": isMobile() ? "50vw":"540px",
        });
        debugPush("dialog", settingDialog);
        const actionButtons = settingDialog.element.querySelectorAll(`#${CONSTANTS.PLUGIN_NAME}-form-action button`);
        actionButtons[0].addEventListener("click",()=>{settingDialog.destroy()}),
        actionButtons[1].addEventListener("click",()=>{
            debugPush('SAVING');
            let uiSettings = loadUISettings(settingForm);
            this.saveData(`settings.json`, JSON.stringify(uiSettings));
            Object.assign(g_setting, uiSettings);
            removeStyle();
            setStyle();  
            removeMouseKeyboardListener();
            setMouseKeyboardListener();
            debugPush("SAVED");
            settingDialog.destroy();
        });
        // 绑定dialog和移除操作

        // 生成配置页面
        const hello = document.createElement('div');
        const settingForm = document.createElement("form");
        settingForm.setAttribute("name", CONSTANTS.PLUGIN_NAME);
        settingForm.innerHTML = generateSettingPanelHTML([
            new SettingProperty("docMaxNum", "NUMBER", [0, 1024]),
            new SettingProperty("nameMaxLength", "NUMBER", [0, 1024]),
            new SettingProperty("showNotebook", "SWITCH", null),
            new SettingProperty("typeHide", "SWITCH", null),
            // new SettingProperty("foldedFrontShow", "NUMBER", [0, 8]),
            // new SettingProperty("foldedEndShow", "NUMBER", [0, 8]),
        ]);

        hello.appendChild(settingForm);
        settingDialog.element.querySelector(`#${CONSTANTS.PLUGIN_NAME}-form-content`).appendChild(hello);
    }
}



// debug push
let g_DEBUG = 0; // 2 写入前台 1 只控制台
let g_DEBUG_ELEM = null;

function commonPush(str, ...args) {
    if (g_DEBUG == 0 && (window["OpaqueGlassDebug"] != true)) return;
    let parsedArgsStr = "";
    for (let arg of args) {
        parsedArgsStr += arg;
    }
    if (g_DEBUG_ELEM && g_DEBUG > 1) {   
        g_DEBUG_ELEM.innerText = parsedArgsStr;
        return false;
    }
    return true;
}

function debugPush(str, ...args) {
    if (commonPush(str, ...args)) {
        console.log("ogdb "+str, ...args);
    }
}

function errorPush(str, ... args) {
    if (commonPush(str, ...args)) {
        console.error("ogdb "+str, ...args);
    }
}

function warnPush(str, ... args) {
    if (commonPush(str, ...args)) {
        console.warn("ogdb "+str, ...args);
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
        removeObserver();
        removeStyle();
        removeMouseKeyboardListener();
        setObserver();
        setStyle();
        setMouseKeyboardListener();
        successFlag = true;
        clearTimeout(g_initFailedMsgTimeout);
    }catch(e) {
        warnPush("文档面包屑插件初始化失败（重试中）", e);
    }
    if (successFlag) {
        clearInterval(g_initRetryInterval);
        warnPush("文档面包屑插件初始化【重试成功】");
    }
}


/**
 * 设置监视器Observer
 */
function setObserver() {
    if (g_isMobile) {
        g_switchTabObserver = new MutationObserver(async (mutationList) => {
            for (let mutation of mutationList) {
                // console.log("发现页签切换", mutation);
                setTimeout(async () => {
                    console.time(g_TIMER_LABLE_NAME_COMPARE);
                    try{
                        // TODO: 改为动态获取id
                        await main([mutation.target]);
                    }catch(err) {
                        errorPush(err);
                    }
                    console.timeEnd(g_TIMER_LABLE_NAME_COMPARE);
                }, Math.round(Math.random() * CONSTANTS.OBSERVER_RANDOM_DELAY) + CONSTANTS.OBSERVER_RANDOM_DELAY_ADD);
            }
        });
        g_switchTabObserver.observe(window.document.querySelector(".protyle-background[data-node-id]"), {"attributes": true, "attributeFilter": ["data-node-id"]});
        debugPush("MOBILE_LOADED");
        main();
        return;
    }
    g_switchTabObserver = new MutationObserver(async (mutationList) => {
        for (let mutation of mutationList) {
            // console.log("发现页签切换", mutation);
            setTimeout(async () => {
                console.time(g_TIMER_LABLE_NAME_COMPARE);
                try{
                    // TODO: 改为动态获取id
                    await main([mutation.target]);
                }catch(err) {
                    errorPush(err);
                }
                console.timeEnd(g_TIMER_LABLE_NAME_COMPARE);
            }, Math.round(Math.random() * CONSTANTS.OBSERVER_RANDOM_DELAY) + CONSTANTS.OBSERVER_RANDOM_DELAY_ADD);
        }
    });
    g_windowObserver = new MutationObserver((mutationList) => {
        for (let mutation of mutationList) {
            // console.log("发现窗口变化", mutation);
            if (mutation.removedNodes.length > 0 || mutation.addedNodes.length > 0) {
                // console.log("断开Observer");
                // tabBarObserver.disconnect();
                g_switchTabObserver.disconnect();
                clearInterval(g_observerRetryInterval);
                g_observerRetryInterval = setInterval(observerRetry, CONSTANTS.OBSERVER_RETRY_INTERVAL);
            }
            
        }
        
    });
    g_observerRetryInterval = setInterval(observerRetry, CONSTANTS.OBSERVER_RETRY_INTERVAL);
    g_windowObserver.observe(window.siyuan.layout.centerLayout.element, {childList: true});
}
/**
 * 重试页签监听
 */
function observerRetry() {
    g_tabbarElement = window.siyuan.layout.centerLayout.element.querySelectorAll("[data-type='wnd'] ul.layout-tab-bar");
    if (g_tabbarElement.length > 0) {
        // console.log("重新监视页签变化");
        g_tabbarElement.forEach((element)=>{
            g_switchTabObserver.observe(element, {"attributes": true, "attributeFilter": ["data-activetime"], "subtree": true});
            
            // 重启监听后立刻执行检查
            if (element.children.length > 0) {
                g_observerStartupRefreshTimeout = setTimeout(async () => {
                    // console.time(g_TIMER_LABLE_NAME_COMPARE);
                    try{
                        // TODO
                        await main(element.children);
                    }catch (err) {
                        errorPush(err);
                    }
                    // console.timeEnd(g_TIMER_LABLE_NAME_COMPARE);
                }, Math.round(Math.random() * CONSTANTS.OBSERVER_RANDOM_DELAY) + CONSTANTS.OBSERVER_RANDOM_DELAY_ADD);
            }
        });
        clearInterval(g_observerRetryInterval);
    }
}

function removeObserver() {
    g_switchTabObserver?.disconnect();
    g_windowObserver?.disconnect();
}

async function main(targets) {
    // 获取当前文档id
    const docId = getCurrentDocIdF();
    const docDetail = await getCurrentDocDetail(docId);
    debugPush('DETAIL', docDetail);
    if (!isValidStr(docDetail)) return;
    // 检查是否重复插入
    if (window.top.document.querySelector(`.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .${CONSTANTS.CONTAINER_CLASS_NAME}`)) return;
    // 获取并解析hpath与path
    let pathObject = await parseDocPath(docDetail, docId);
    debugPush("OBJECT", pathObject);
    // 组合显示元素
    let element = await generateElement(pathObject, docId);
    debugPush("ELEMT", element);
    // 插入显示元素和设置监听
    setAndApply(element, docId);
}

async function parseDocPath(docDetail) {
    let pathArray = docDetail.path.substring(0, docDetail.path.length - 3).split("/");
    let hpathArray = docDetail.hpath.split("/");
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
        "type": "NOTEBOOK"
    }
    resultArray.push(temp);
    let temp_path = "";
    for (let i = 1; i < pathArray.length; i++) {
        let temp = {
            "name": hpathArray[i],
            "id": pathArray[i],
            "icon": "",
            "path": `${temp_path}/${pathArray[i]}.sy`,
            "box": box.id,
            "type": "FILE",
        }
        temp_path += "/" + pathArray[i];
        resultArray.push(temp);
    }
    return resultArray;
}

async function generateElement(pathObjects, docId) {
    const divideArrow = `<span class="og-fake-breadcrumb-arrow-span" data-type="%4%" data-parent-id="%5%"><svg class="protyle-breadcrumb__arrow ${CONSTANTS.ARROW_CLASS_NAME}"
        data-type="%4%" data-parent-id="%5%">
        <use xlink:href="#iconRight"></use></svg></span>`;
    const oneItem = `<span class="protyle-breadcrumb__item fake-breadcrumb-click" data-node-id="%0%" data-type="%3%" data-node-names="%NAMES%">
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
                .replaceAll("%NAMES%", JSON.stringify(hidedNames).replaceAll(`"`, `'`));
            htmlStr += divideArrow.replaceAll("%4%", "HIDE");
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
                .replaceAll("%3%", onePathObject.type);
        }
        htmlStr += divideArrow
            .replaceAll("%4%", onePathObject.type)
            .replaceAll("%5%", pathObjects[i].id);
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
    barElement.classList.add("protyle-breadcrumb__bar--nowrap");
    barElement.innerHTML = htmlStr;
    result.appendChild(barElement);
    result.classList.add(CONSTANTS.CONTAINER_CLASS_NAME);
    result.classList.add("protyle-breadcrumb");
    result.style.top = (window.document.querySelector(`.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .protyle-breadcrumb`).clientHeight) + "px";
    // 修改以使得内容下移30px .protyle-content
    return result;
    
}

function setAndApply(element, docId) {
    window.top.document.querySelector(`.fn__flex-1.protyle:has(.protyle-background[data-node-id="${docId}"]) .protyle-breadcrumb`).insertAdjacentElement("beforebegin",element);
    [].forEach.call(window.document.querySelectorAll(`.fake-breadcrumb-click[data-type="FILE"]`), (elem)=>{
        elem.removeEventListener("click", openRefLink);
        elem.addEventListener("click", openRefLink);
    });
    [].forEach.call(window.document.querySelectorAll(`.fake-breadcrumb-click[data-type="..."]`), (elem)=>{
        elem.removeEventListener("click", openHideMenu);
        elem.addEventListener("click", openHideMenu);
    });
    [].forEach.call(window.document.querySelectorAll(`.og-fake-breadcrumb-arrow-span[data-type="FILE"], .og-fake-breadcrumb-arrow-span[data-type="NOTEBOOK"]`), (elem)=>{
        elem.removeEventListener("click", openRelativeMenu);
        elem.addEventListener("click", openRelativeMenu);
    });
    // setDisplayHider();
}

function openHideMenu(event) {
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
                    altKey: event?.altKey});
            }
        }
        tempMenu.addItem(tempMenuItemObj);
    }

    tempMenu.open({x: rect.left, y: rect.bottom,isLeft:false});
}


async function openRelativeMenu(event) {
    let id = event.currentTarget.getAttribute("data-parent-id");
    let rect = event.currentTarget.getBoundingClientRect();
    event.stopPropagation();
    event.preventDefault();
    let sqlResult = await sqlAPI(`SELECT * FROM blocks WHERE id = '${id}'`);
    if (sqlResult.length == 0) {
        sqlResult = [{
            path: "/",
            box: id
        }];
    }
    let siblings = await getChildDocuments(id, sqlResult);
    if (siblings.length <= 0) return;
    const tempMenu = new siyuan.Menu("newMenu");
    for (let i = 0; i < siblings.length; i++) {
        let currSibling = siblings[i];
        currSibling.name = currSibling.name.substring(0, currSibling.name.length - 3);
        let trimedName = currSibling.name.length > g_setting.nameMaxLength ? 
            currSibling.name.substring(0, g_setting.nameMaxLength) + "..."
            : currSibling.name;
        let tempMenuItemObj = {
            label: `<span class="${CONSTANTS.MENU_ITEM_CLASS_NAME}" 
                data-doc-id="${currSibling.id}"
                title="${currSibling.name}">
                ${trimedName}
            </span>`,
            click: (event)=>{
                let docId = event.querySelector("[data-doc-id]")?.getAttribute("data-doc-id")
                openRefLink(undefined, docId, {
                    ctrlKey: event?.ctrlKey,
                    shiftKey: event?.shiftKey,
                    altKey: event?.altKey});
            }
        }
        if (currSibling.icon != "" && currSibling.icon.indexOf(".") == -1) {
            tempMenuItemObj["icon"] = `icon-${currSibling.icon}`;
        }
        tempMenu.addItem(tempMenuItemObj);
    }

    tempMenu.open({x: rect.left, y: rect.bottom, isLeft:false});
    
}


function getNotebooks() {
    let notebooks = window.top.siyuan.notebooks;
    return notebooks;
}


async function getCurrentDocDetail(docId) {
    let sqlResult = await sqlAPI(`SELECT * FROM blocks WHERE id = "${docId}"`);
    return sqlResult[0];
}

/**
 * 获取文档相关信息：父文档、同级文档、子文档
 */
async function getDocumentRelations(docId, sqlResult) {
    // let sqlResult = await sqlAPI(`SELECT * FROM blocks WHERE id = "${docId}"`);
     // 获取父文档
    let parentDoc = await getParentDocument(docId, sqlResult);
    
    // 获取子文档
    let childDocs = await getChildDocuments(docId, sqlResult);

    let noParentFlag = false;
    if (parentDoc.length == 0) {
        noParentFlag = true;
    }
    // 获取同级文档
    let siblingDocs = await getSiblingDocuments(docId, parentDoc, sqlResult, noParentFlag);

    // 超长部分裁剪
    if (childDocs.length > g_setting.docMaxNum && g_setting.docMaxNum != 0) {
        childDocs = childDocs.slice(0, g_setting.docMaxNum);
    }
    if (siblingDocs.length > g_setting.docMaxNum && g_setting.docMaxNum != 0) {
        siblingDocs = siblingDocs.slice(0, g_setting.docMaxNum);
    }

    // 返回结果
    return [ parentDoc, childDocs, siblingDocs ];
}

async function getParentDocument(docId, sqlResult) {
    let splitText = sqlResult[0].path.split("/");
    if (splitText.length <= 2) return [];
    let parentSqlResult = await sqlAPI(`SELECT * FROM blocks WHERE id = "${splitText[splitText.length - 2]}"`);
    return parentSqlResult;
}

async function getChildDocuments(docId, sqlResult) {
    let childDocs = await listDocsByPath({path: sqlResult[0].path, notebook: sqlResult[0].box});
    if (childDocs.files.length > g_setting.docMaxNum && g_setting.docMaxNum != 0) {
        childDocs.files = childDocs.files.slice(0, g_setting.docMaxNum);
    }
    return childDocs.files;
}

async function getSiblingDocuments(docId, parentSqlResult, sqlResult, noParentFlag) {
    let siblingDocs = await listDocsByPath({path: noParentFlag ? "/" : parentSqlResult[0].path, notebook: sqlResult[0].box});
    return siblingDocs.files;
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
    
    .${CONSTANTS.CONTAINER_CLASS_NAME} .protyle-breadcrumb__text {
        margin-left: 0px;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .og-fake-breadcrumb-arrow-span[data-type=FILE], .og-fake-breadcrumb-arrow-span[data-type=NOTEBOOK] {
        cursor: pointer;
    }
    .og-hide-breadcrumb {
        opacity: 0;
        transition: 1s;
    }

    .og-fake-breadcrumb-arrow-span:hover {
        color: var(--b3-menu-highlight-color);
        background-color: var(--b3-menu-highlight-background);
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

/**
 * 在html中显示文档icon
 * @param {*} iconString files[x].icon
 * @param {*} hasChild 
 * @returns 
 */
function getEmojiHtmlStr(iconString, hasChild) {
    if (g_setting.icon == CONSTANTS.ICON_NONE) return g_setting.linkDivider;
    // 无emoji的处理
    if ((iconString == undefined || iconString == null ||iconString == "") && g_setting.icon == CONSTANTS.ICON_ALL) return hasChild ? "📑" : "📄";//无icon默认值
    if ((iconString == undefined || iconString == null ||iconString == "") && g_setting.icon == CONSTANTS.ICON_CUSTOM_ONLY) return g_setting.linkDivider;
    let result = iconString;
    // emoji地址判断逻辑为出现.，但请注意之后的补全
    if (iconString.indexOf(".") != -1) {
        result = `<img class="iconpic" style="width: ${g_setting.fontSize}px" src="/emojis/${iconString}"/>`;
    } else {
        result = `<span class="emojitext">${emojiIconHandler(iconString, hasChild)}</span>`;
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

async function listDocsByPath({path, notebook = undefined, sort = undefined, maxListLength = undefined}) {
    let data = {
        path: path
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

function getCurrentDocIdF() {
    let thisDocId;
    thisDocId = window.top.document.querySelector(".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
    if (!thisDocId && g_isMobile) {
        // UNSTABLE: 面包屑样式变动将导致此方案错误！
        try {
            let temp;
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
            errorPush(e);
            temp = null;
        }
    }
    if (!thisDocId) {
        thisDocId = window.top.document.querySelector(".protyle-background")?.getAttribute("data-node-id");
    }
    return thisDocId;
}

/**
 * 在点击<span data-type="block-ref">时打开思源块/文档
 * 为引入本项目，和原代码相比有更改
 * @refer https://github.com/leolee9086/cc-template/blob/6909dac169e720d3354d77685d6cc705b1ae95be/baselib/src/commonFunctionsForSiyuan.js#L118-L141
 * @license 木兰宽松许可证
 * @param {点击事件} event 
 */
let openRefLink = function(event, paramId = "", keyParam = undefined){
    
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
    let 虚拟链接 =  主界面.createElement("span")
    虚拟链接.setAttribute("data-type","block-ref")
    虚拟链接.setAttribute("data-id",id)
    虚拟链接.style.display = "none";//不显示虚拟链接，防止视觉干扰
    let 临时目标 = 主界面.querySelector(".protyle-wysiwyg div[data-node-id] div[contenteditable]")
    临时目标.appendChild(虚拟链接);
    let clickEvent = new MouseEvent("click", {
        ctrlKey: event?.ctrlKey ?? keyParam?.ctrlKey,
        shiftKey: event?.shiftKey ?? keyParam?.shiftKey,
        altKey: event?.altKey ?? keyParam?.altKey,
        bubbles: true
    });
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

let en_US = {
    
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
        }
        
        resultHTML += temp.replace("*#*##*#*", inputElemStr);
    }
    // console.log(resultHTML);
    return resultHTML;
}

/**
 * 由配置文件读取配置
 */
function loadCacheSettings() {
    // 检索当前页面所有设置项元素

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
        result[number.name] = parseFloat(number.value);
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