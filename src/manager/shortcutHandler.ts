import { showMessage, Plugin } from "siyuan";


export function bindCommand(pluginInstance: Plugin) {
    // pluginInstance.addCommand({
    //     langKey: "go_up",
    //     hotkey: "⌥⌘←",
    //     callback: () => {
    //         goUpShortcutHandler();
    //     },
    // });
    // 图标的制作参见帮助文档
    pluginInstance.addIcons(`<symbol id="iconOgHnBookUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13V7"/><path d="M18 2h1a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2"/><path d="m9 10 3-3 3 3"/><path d="m9 5 3-3 3 3"/>
        </symbol>
    `);
}

