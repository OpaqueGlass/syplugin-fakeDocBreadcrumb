
export class CONSTANTS {
    public static readonly PLUGIN_SHORT_NAME: string = "fdb";
    public static readonly PLUGIN_FULL_NAME: string = "文档面包屑";

    public static readonly OBSERVER_WND_ID = `og_${CONSTANTS.PLUGIN_SHORT_NAME}_observer`;
    public static readonly MENU_WND_ID = `og_${CONSTANTS.PLUGIN_SHORT_NAME}_menu`;
    public static readonly STYLE_ID: string = `fake-doc-breadcrumb-plugin-style`;
    public static readonly WND_TEMP_ID = `og_${CONSTANTS.PLUGIN_SHORT_NAME}_temp`;

    // 面包屑相关
    public static readonly CONTAINER_CLASS_NAME = "og-fake-doc-breadcrumb-container";
    public static readonly ARROW_SPAN_NAME = "og-fake-doc-breadcrumb-arrow-span";
    public static readonly ARROW_CLASS_NAME = "og-fake-doc-breadcrumb-arrow";
    public static readonly MENU_ITEM_CLASS_NAME = "og-fake-doc-breadcrumb-menu-item-container";
    public static readonly SIBLING_CONTAINER_ID = "og-fake-doc-breadcrumb-sibling-doc-container";
    public static readonly INDICATOR_CLASS_NAME = "og-fake-doc-breadcrumb-doc-indicator";
    public static readonly MENU_CURRENT_DOC_CLASS_NAME = "og-fdb-current-doc-in-menu";

    // 图标模式
    public static readonly ICON_NONE = 0;
    public static readonly ICON_CUSTOM_ONLY = 1;
    public static readonly ICON_ALL = 2;

    // 相邻文档模式
    public static readonly ADJ_NONE = "0";
    public static readonly ADJ_SAME_PARENT = "1";
    public static readonly ADJ_SAME_LEVEL = "2";

    // 冲突插件
    public static readonly MULTILINE_CONFLICT_PLUGINS = ["siyuan-plugin-toolbar-plus"];

    // 其他
    public static readonly MAX_NAME_LENGTH = 15;
    public static readonly SAVE_TIMEOUT = 900;
    public static readonly ADJACENT_DOC_CACHE_TTL = 3 * 60 * 1000; // 3分钟
}
