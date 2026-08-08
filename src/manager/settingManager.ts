import outdatedSettingVue from "@/components/dialog/outdatedSetting.vue";
import { CONSTANTS } from "@/constants";
import { debugPush, logPush } from "@/logger";
import { isMobile } from "@/syapi";
import { generateUUID } from "@/utils/common";
import { isValidStr } from "@/utils/commonCheck";
import { getPluginInstance } from "@/utils/getInstance";
import { lang } from "@/utils/lang";
import { setStyle } from "@/worker/setStyle";
import * as siyuan from "siyuan";
import { createApp, nextTick, ref, watch } from "vue";
import { ConfigProperty, loadAllConfigPropertyFromTabProperty, TabProperty } from "../utils/settings";

// const pluginInstance = getPluginInstance();

const settingDefinition = new Array<IConfigProperty>;

let setting: any = ref({});

const defaultSetting: any = {
    "@version": 20260705,
    nameMaxLength: 15,
    docMaxNum: 128,
    showNotebook: true,
    typeHide: false,
    foldedFrontShow: 2,
    foldedEndShow: 3,
    oneLineBreadcrumb: false,
    timelyUpdate: true,
    immediatelyUpdate: false,
    allowFloatWindow: false,
    usePluginArrow: true,
    notOnlyOpenDocs: false,
    preferOpenInCurrentSplit: true,
    icon: 1,
    menuKeepCurrentVisible: true,
    menuExtendSubDocDepth: 2,
    swapClickFunction: false,
    showRoot: false,
    showAdjacentDocButton: "2",
    autoFixFocusError: false,
    createDocBtnInMenu: false,
    debugMode: false,
}

let tabProperties: Array<TabProperty> = [
    
];
let updateTimeout: any = null;


/**
 * 设置项初始化
 * 应该在语言文件载入完成后调用执行
 */
export function initSettingProperty() {
    tabProperties.push(
        new TabProperty({"key": "breadcrumb", "iconKey": "iconAlignTop", showColumnAsGroup: true, props: {
            "display": [
                new ConfigProperty({"key": "showNotebook", "type": "SWITCH"}),
                new ConfigProperty({"key": "showRoot", "type": "SWITCH"}),
                new ConfigProperty({"key": "oneLineBreadcrumb", "type": "SWITCH"}),
                new ConfigProperty({"key": "usePluginArrow", "type": "SWITCH"}),
                new ConfigProperty({"key": "icon", "type": "SELECT", "options": ["0", "1", "2"]}),
            ],
            "fold": [
                new ConfigProperty({"key": "foldedFrontShow", "type": "NUMBER", "min": 0, "max": 50}),
                new ConfigProperty({"key": "foldedEndShow", "type": "NUMBER", "min": 0, "max": 50}),
                new ConfigProperty({"key": "nameMaxLength", "type": "NUMBER", "min": 1, "max": 200}),
            ],
            "behavior": [
                new ConfigProperty({"key": "timelyUpdate", "type": "SWITCH"}),
                new ConfigProperty({"key": "immediatelyUpdate", "type": "SWITCH"}),
                new ConfigProperty({"key": "allowFloatWindow", "type": "SWITCH"}),
                new ConfigProperty({"key": "swapClickFunction", "type": "SWITCH"}),
                new ConfigProperty({"key": "typeHide", "type": "SWITCH"}),
            ],
            "adjacentDoc": [
                new ConfigProperty({"key": "showAdjacentDocButton", "type": "SELECT", "options": ["0", "1", "2"]}),
            ],
            "menu": [
                new ConfigProperty({"key": "menuKeepCurrentVisible", "type": "SWITCH"}),
                new ConfigProperty({"key": "menuExtendSubDocDepth", "type": "NUMBER", "min": 0, "max": 10}),
                new ConfigProperty({"key": "createDocBtnInMenu", "type": "SWITCH"}),
            ],
        }}),
        new TabProperty({"key": "advanced", "iconKey": "iconSettings", props: [
            new ConfigProperty({"key": "notOnlyOpenDocs", "type": "SWITCH"}),
            new ConfigProperty({"key": "preferOpenInCurrentSplit", "type": "SWITCH"}),
            new ConfigProperty({"key": "autoFixFocusError", "type": "SWITCH"}),
            new ConfigProperty({"key": "docMaxNum", "type": "NUMBER", "min": 0, "max": 1024}),
        ]}),
        new TabProperty({"key": "about", "iconKey": "iconInfo", props: [
            new ConfigProperty({"key": "aboutAuthor", "type": "TIPS"}),
            new ConfigProperty({"key": "settingIconTips", "type": "TIPS"}),
            new ConfigProperty({"key": "debugMode", "type": "SWITCH"}),
        ]}),
    );
}

export function getTabProperties() {
    return tabProperties;
}

// 发生变动之后，由界面调用这里
export function saveSettings(newSettings: any) {
    // 如果有必要，需要判断当前设备，然后选择保存位置
    debugPush("界面调起保存设置项", newSettings);
    getPluginInstance().saveData("settings_main.json", JSON.stringify(newSettings, null, 4));
}


/**
 * 仅用于初始化时载入设置项
 * 请不要重复使用
 * @returns 
 */
export async function loadSettings() {
    let loadResult = null;
    // 这里从文件载入
    loadResult = await getPluginInstance().loadData("settings_main.json");
    debugPush("文件载入设置", loadResult);
    if (loadResult == undefined || loadResult == "") {
        let oldSettings = await transferOldSetting();
        debugPush("oldSettings", oldSettings);
        if (oldSettings != null) {
            debugPush("使用转换后的旧设置", oldSettings);
            loadResult = oldSettings;
        } else {
            loadResult = defaultSetting;
        }
    }
    const currentVersion = 20260301;
    let saveItNowFlag = false;
    if (!loadResult["@version"] || loadResult["@version"] < currentVersion) {
        // 旧版本
        loadResult["@version"] = currentVersion;
        
    }
    // showOutdatedSettingWarnDialog(checkOutdatedSettings(loadResult), defaultSetting);
    // 检查选项类设置项，如果发现不在列表中的，重置为默认
    try {
        loadResult = checkSettingType(loadResult);
    } catch(err) {
        logPush("设置项类型检查时发生错误", err);
    }
    
    // 如果有必要，判断设置项是否对当前设备生效
    setting.value = Object.assign(Object.assign({}, defaultSetting), loadResult);
    logPush("载入设置项", setting.value);
    let isInternalUpdating = false;
    // return loadResult;
    watch(setting, (newVal) => {
        if (isInternalUpdating) {
            debugPush("内部更新设置项，不保存", newVal);
            return;
        }
        // 延迟更新
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        logPush("检查到变化");
        updateTimeout = setTimeout(() => {
            isInternalUpdating = true;
            try {
                let checkedData = checkSettingType(newVal)
                saveSettings(checkedData);
                // logPush("保存设置项", newVal);
                setStyle();
                changeDebug(checkedData);
            } catch(err) {
                logPush("设置项检查时发生错误", err);
            } finally {
                nextTick(() => {
                    isInternalUpdating = false;
                });
            }
            // updateSingleSetting(key, newVal);
            
            updateTimeout = null;
        }, 400);
    }, {deep: true, immediate: saveItNowFlag});
    changeDebug(setting.value);
}

function checkOutdatedSettings(loadSetting) {
    const CHECK_SETTING_KEYS = [
    ];
    let result = [];
    for (let key of CHECK_SETTING_KEYS) {
        if (loadSetting[key] != defaultSetting[key]) {
            result.push(key);
        }
    }
    return result;
}

function showOutdatedSettingWarnDialog(outdatedSettingKeys, defaultSettings) {
    if (outdatedSettingKeys.length == 0) {
        return;
    }
    const app = createApp(outdatedSettingVue, {"outdatedKeys": outdatedSettingKeys, "defaultSettings": defaultSettings});
    const uid = generateUUID();
    const settingDialog = new siyuan.Dialog({
            "title": lang("dialog_panel_plugin_name") + lang("dialog_panel_outdate"),
            "content": `
            <div id="og_plugintemplate_${uid}" class="b3-dialog__content" style="overflow: hidden; position: relative;height: 100%;"></div>
            `,
            "width": isMobile() ? "42vw":"520px",
            "height": isMobile() ? "auto":"auto",
            "destroyCallback": ()=>{app.unmount();},
        });
    app.mount(`#og_plugintemplate_${uid}`);
    return;
}

function changeDebug(newVal) {
    if (newVal.debugMode === true) {
        debugPush("调试模式已开启");
        window.top["OpaqueGlassDebug"] = true;
        if (!window.top["OpaqueGlassDebugV2"]) {
            window.top["OpaqueGlassDebugV2"] = {};
        }
        window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME] = 5;
    } else if (newVal.debugMode === false) {
        debugPush("调试模式已关闭");
        if (window.top["OpaqueGlassDebugV2"] && window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME]) {
            delete window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME];
        }
    }
}
/**
 * 校验并修正设置项
 * @param input 响应式的 setting 对象
 */
function checkSettingType(input: any) {
    const propertyMap = loadAllConfigPropertyFromTabProperty(tabProperties);

    for (const prop of Object.values(propertyMap)) {
        const key = prop.key;
        const currentValue = input[key];
        let targetValue = currentValue; // 默认目标值等于当前值

        // --- 分类型校验逻辑 ---
        if (prop.type === "SELECT") {
            if (!prop.options.includes(currentValue)) {
                targetValue = defaultSetting[key];
            }
        } 
        else if (prop.type === "SWITCH") {
            if (currentValue === undefined) {
                targetValue = defaultSetting[key];
            }
        } 
        else if (prop.type === "NUMBER") {
            if (isValidStr(currentValue)) {
                let num = parseFloat(currentValue);
                // 边界逻辑修正
                if (key === "docMaxNum" && num === 0) {
                    num = prop.max;
                }
                if (prop.min !== undefined && num < prop.min) {
                    num = prop.min;
                }
                if (prop.max !== undefined && num > prop.max) {
                    num = prop.max;
                }
                targetValue = num;
            }
        }
        // --- 结束分类型校验逻辑 ---
        if (input[key] !== targetValue) {
            input[key] = targetValue;
        }
    }
    return input;
}

async function transferOldSetting() {
    const oldSettings = await getPluginInstance().loadData("settings.json");
    let newSetting = Object.assign({}, oldSettings);
    if (oldSettings == null || oldSettings == "") {
        return null;
    }

    // START 版本迁移
    // showAdjacentDocButton: boolean -> string
    if (typeof newSetting.showAdjacentDocButton === "boolean") {
        newSetting.showAdjacentDocButton = newSetting.showAdjacentDocButton ? "2" : "0";
    }
    // end 版本迁移

    // 移除过时的设置项
    for (let key of Object.keys(newSetting)) {
        if (!(key in defaultSetting)) {
            delete newSetting[key];
        }
    }
    newSetting = Object.assign(Object.assign({}, defaultSetting), newSetting);
    
    return newSetting;
}

export function getGSettings() {
    // logPush("getConfig", setting.value, setting);
    // 改成 setting._rawValue不行
    return setting;
}

export function getReadOnlyGSettings() {
    return setting._rawValue;
}

export function getDefaultSettings() {
    return defaultSetting;
}
