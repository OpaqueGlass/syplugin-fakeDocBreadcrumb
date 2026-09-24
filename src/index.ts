import {
    Plugin,
    showMessage,
    getFrontend,
} from "siyuan";
import * as siyuan from "siyuan";
import "@/index.scss";

import { createApp } from "vue";
import settingVue from "./components/settings/setting.vue";
import { setLanguage } from "./utils/lang";
import { debugPush, errorPush, logPush } from "./logger";
import { addAfterSettingChangedHook, initSettingProperty } from './manager/settingManager';
import { setPluginInstance } from "./utils/getInstance";
import { loadSettings } from "./manager/settingManager";
import EventHandler from "./manager/eventHandler";
import { removeStyle, setStyle } from "./manager/setStyle";
import { bindCommand } from "./manager/shortcutHandler";
import { generateUUID } from "./utils/common";
import { CONSTANTS } from "./constants";
import { isAnyPluginExist } from "./utils/common";
import { isMobile } from "./syapi";
import { showPluginMessage } from "./utils/common";
import { lang } from "./utils/lang";

export default class FakeDocBreadcrumbPlugin extends Plugin {
    private myEventHandler: EventHandler;

    async onload() {
        setLanguage(this.i18n);
        setPluginInstance(this);
        initSettingProperty();
        bindCommand(this);

        // 检测冲突插件
        if (isAnyPluginExist(CONSTANTS.MULTILINE_CONFLICT_PLUGINS)) {
            showPluginMessage(lang("conflict_plugin_warn"));
        }

        this.myEventHandler = new EventHandler();
    }

    onLayoutReady(): void {
        addAfterSettingChangedHook(() => {
            this.myEventHandler.getBreadcrumbManager().refreshAllOpenDocs();
        });

        loadSettings().then(() => {
            this.myEventHandler.bindHandler();
            setStyle();
            // 插件启用时对当前所有显示中的文档显式补跑一次插入
            this.myEventHandler.getBreadcrumbManager().refreshAllOpenDocs();
        }).catch((e) => {
            showMessage("Load plugin settings failed." + this.name);
            errorPush(e);
        });
    }

    onunload(): void {
        // 解绑事件
        this.myEventHandler.unbindHandler();
        // 移除所有已经插入的面包屑
        document.querySelectorAll(`.${CONSTANTS.CONTAINER_CLASS_NAME}`).forEach((elem) => elem.remove());
        document.querySelectorAll(`.og-breadcrumb-oneline-divider`).forEach((elem) => elem.remove());
        // 移动端相邻文档按钮不带容器类名，需按移动端标记单独清理
        document.querySelectorAll(`[${CONSTANTS.MOBILE_MARKER_ATTR}]`).forEach((elem) => elem.remove());
        // 移除块面包屑菜单标记
        document.querySelectorAll(`[data-og-fdb-added-el]`).forEach((elem) => {
            elem.removeAttribute("data-og-fdb-added-el");
        });
        // 移除样式
        removeStyle();
        // 清理绑定的宽度监听
        if (window[CONSTANTS.OBSERVER_WND_ID]) {
            for (const key in window[CONSTANTS.OBSERVER_WND_ID]) {
                debugPush("插件卸载清理observer", key);
                window[CONSTANTS.OBSERVER_WND_ID][key]?.disconnect();
            }
            delete window[CONSTANTS.OBSERVER_WND_ID];
        }
    }

    openSetting() {
        const uid = generateUUID();
        const app = createApp(settingVue);
        const settingDialog = new siyuan.Dialog({
            "title": this.i18n["setting_panel_title"],
            "content": `
            <div id="og_plugintemplate_${uid}" style="overflow: hidden; position: relative;height: 100%;"></div>
            `,
            "width": isMobile() ? "92vw" : "1040px",
            "height": isMobile() ? "50vw" : "80vh",
            "destroyCallback": () => { app.unmount(); },
        });
        app.mount(`#og_plugintemplate_${uid}`);
    }
}
