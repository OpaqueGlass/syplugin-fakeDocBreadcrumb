import { getPluginInstance } from "@/utils/getInstance";
import Mutex from "@/utils/mutex";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { BreadcrumbManager } from "@/manager/breadcrumbManager";
import { getProtyleInfo } from "@/utils/onlyThisUtil";
import { debugPush, infoPush } from "@/logger";
import type { IEventBusMap } from "siyuan";

export default class EventHandler {
    private handlerBindList: Record<string, (arg1: CustomEvent) => void> = {
        "loaded-protyle-static": this.onProtyleLoaded.bind(this),
        "switch-protyle": this.onProtyleLoaded.bind(this),
        "ws-main": this.onWsMain.bind(this),
    };
    // 关联的设置项，如果设置项对应为true，则才执行绑定
    private relateGsettingKeyStr: Record<string, string> = {
        "loaded-protyle-static": null,
        "switch-protyle": null,
        "ws-main": "immediatelyUpdate",
    };

    private breadcrumbManager: BreadcrumbManager;

    constructor() {
        this.breadcrumbManager = new BreadcrumbManager();
    }

    bindHandler() {
        const plugin = getPluginInstance();
        const g_setting = getReadOnlyGSettings();
        for (const key in this.handlerBindList) {
            if (this.relateGsettingKeyStr[key] == null || g_setting[this.relateGsettingKeyStr[key]]) {
                plugin.eventBus.on(key, this.handlerBindList[key]);
            }
        }
    }

    unbindHandler() {
        const plugin = getPluginInstance();
        for (const key in this.handlerBindList) {
            plugin.eventBus.off(key, this.handlerBindList[key]);
        }
    }

    /**
     * protyle 加载/切换事件处理
     * 对应原 refer.js mainEventBusHander
     */
    private async onProtyleLoaded(event: CustomEvent<IEventBusMap["loaded-protyle-static"]>) {
        const protyle = event.detail.protyle;
        if (!protyle) return;

        const setting = getReadOnlyGSettings();

        // 过滤非传统 protyle（内嵌/浮窗）
        if (protyle.model == null && !setting.notOnlyOpenDocs) {
            infoPush("插件内嵌Protyle、浮窗。停止操作。", protyle);
            return;
        }
        debugPush("正确Protyle", protyle);

        // 添加块面包屑菜单监听
        this.breadcrumbManager.addBlockBdMenuListener(protyle.element, protyle.block.rootID, protyle);

        // 调用 BreadcrumbManager 处理
        await this.breadcrumbManager.processProtyle(protyle);
    }

    /**
     * ws-main 事件处理
     * 对应原 refer.js eventBusHandler
     */
    private async onWsMain(event: CustomEvent<IEventBusMap["ws-main"]>) {
        const cmdType = ["moveDoc", "rename", "removeDoc", "filetreeSortChanged"];
        const cmd = (event.detail as any)?.cmd;
        if (cmdType.indexOf(cmd) === -1) return;

        await this.breadcrumbManager.refreshAllOpenDocs();
    }

    /** 获取 BreadcrumbManager 实例 */
    getBreadcrumbManager(): BreadcrumbManager {
        return this.breadcrumbManager;
    }
}
