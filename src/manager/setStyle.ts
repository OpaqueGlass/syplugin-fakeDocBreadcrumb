import { CONSTANTS } from "@/constants";
import { logPush } from "@/logger";
import { getDefaultSettings, getReadOnlyGSettings } from "@/manager/settingManager";
import { isCurrentVersionLessThan } from "@/utils/commonCheck";
import { isNotebookDocEnabled } from "@/utils/compatUtils";

export function setStyle() {
    removeStyle();
    const g_setting = getReadOnlyGSettings();
    logPush("set style", g_setting);
    const head = document.getElementsByTagName('head')[0];
    const style = document.createElement('style');
    style.setAttribute("id", CONSTANTS.STYLE_ID);

    const styleForv3_7_0 = isCurrentVersionLessThan("3.7.0") ? `` : `
    .og-fake-doc-breadcrumb-arrow {
        height: 14px;
        width: 14px;
    }
    .og-fake-doc-breadcrumb-container.og-breadcrumb-oneline .protyle-breadcrumb__bar {
        height: 100%;
    }
    `;

    // 面包屑文档名最大长度（em）：0 表示沿用自适应宽度，
    const breadcrumbNameMaxLength = Number(g_setting?.breadcrumbNameMaxLength) || 0;
    const styleForEllipsisMaxWidth = breadcrumbNameMaxLength > 0
        ? `${breadcrumbNameMaxLength}em`
        : `min(112px, 12em, 15vw)`;

    // 隐藏原生块面包屑：仅在「单行面包屑」(oneLineBreadcrumb) 开启时才有意义，
    // 因为原生面包屑的隐藏依赖 .og-breadcrumb-oneline 容器类与分隔线元素。
    const styleForHideNativeBreadcrumb = (g_setting.hideNativeBreadcrumb && g_setting.oneLineBreadcrumb) ? `
    .og-breadcrumb-oneline ~ .protyle-breadcrumb__bar, .og-breadcrumb-oneline-divider, .og-breadcrumb-oneline ~ .protyle-breadcrumb__bar ~ .protyle-breadcrumb__space {
        display: none;
    }
    ` : ``;

    style.innerHTML = `
    .og-breadcrumb-oneline {
        margin-right: 3px;
        overflow-x: auto;
        flex-shrink: 0.5;
        flex: 1 1 max-content;
    }
    .protyle-breadcrumb .og-fake-doc-breadcrumb-container.og-breadcrumb-oneline {
        position: relative;
    }
    .og-breadcrumb-oneline-divider {
        background-color: var(--b3-theme-on-surface-lighter);
        flex-shrink: 0;
        align-self: stretch;
        margin: 4px;
        width: 1px;
        height: 60%;
        align-self: center;
    }
    .og-breadcrumb-oneline + .protyle-breadcrumb__bar {
        flex: 1 1 max-content;
    }
    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item[data-og-type="NOTEBOOK"] {
        ${isNotebookDocEnabled() ? '' : 'cursor: default;'};
    }
    /* 不可点击的项（根节点 / 禁用笔记本文档时的笔记本层级）：去除指针与悬停高亮 */
    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item.og-fake-doc-breadcrumb-root,
    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item.og-fdb-not-clickable {
        cursor: default !important;
    }
    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item.og-fake-doc-breadcrumb-root:hover,
    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__item.og-fdb-not-clickable:hover {
        background: transparent !important;
        cursor: default !important;
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
    .b3-menu__item img.og-fdb-menu-emojipic {
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
    .${CONSTANTS.CONTAINER_CLASS_NAME} {
        display: flex !important;
        align-items: center;
        flex-wrap: nowrap;
        gap: 4px;
    }
    .og-fake-doc-breadcrumb-container > .og-fake-doc-breadcrumb-spacer {
        flex: 1 1 auto;
        min-width: 0;
    }
    .og-fake-doc-breadcrumb-container > .protyle-breadcrumb__bar {
        flex: 0 1 auto;
        min-width: 0;
    }
    .og-fake-doc-breadcrumb-arrow-span[data-og-type=FILE],
    .og-fake-doc-breadcrumb-arrow-span[data-og-type=NOTEBOOK],
    .og-fake-doc-breadcrumb-arrow-span[data-og-type=ROOT] {
        cursor: pointer;
    }
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
        flex-shrink: 0;
    }
    svg.og-fake-doc-breadcrumb-arrow.protyle-breadcrumb__arrow {
        border: none;
        transform: none;
    }
    .protyle-breadcrumb__bar[data-og-fdb-added-el] .protyle-breadcrumb__arrow {
        cursor: pointer;
    }
    .protyle-breadcrumb__bar[data-og-fdb-added-el] .protyle-breadcrumb__arrow:hover,
    .protyle-breadcrumb__bar[data-og-fdb-added-el] .protyle-breadcrumb__arrow:hover > *,
    .og-fake-doc-breadcrumb-arrow-span:hover {
        color: var(--b3-menu-highlight-color, var(--b3-theme-on-background));
        background-color: var(--b3-menu-highlight-background, var(--b3-list-hover));
    }
    .og-fake-doc-breadcrumb-arrow-span:hover > .og-fake-doc-breadcrumb-arrow {
        color: var(--b3-menu-highlight-color, var(--b3-theme-on-background));
    }
    .og-fdb-doc-nav {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        margin-left: 4px;
        flex-shrink: 0;
    }
    .og-fdb-doc-nav-button {
        align-items: center;
        background: transparent;
        border: none;
        border-radius: var(--b3-border-radius);
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        display: inline-flex;
        gap: 4px;
        height: 24px;
        line-height: 24px;
        justify-content: center;
        max-width: min(180px, 12em, 22vw);
        min-width: 0;
        padding: 0 6px;
    }
    .og-fdb-doc-nav-button svg {
        flex-shrink: 0;
        height: 12px;
        width: 12px;
    }
    .og-fdb-doc-nav-button-text {
        display: inline-block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .og-fdb-doc-nav-button:not(:disabled):hover {
        color: var(--b3-menu-highlight-color, var(--b3-theme-on-background));
        background-color: var(--b3-menu-highlight-background, var(--b3-list-hover));
    }
    .og-fdb-doc-nav-button:disabled {
        cursor: not-allowed;
        opacity: 0.35;
    }
    .og-fdb-doc-nav.og-fdb-doc-nav--equal {
        flex: 1 1 auto;
        max-width: 200px;
    }
    .og-fdb-doc-nav.og-fdb-doc-nav--equal .og-fdb-doc-nav-button {
        flex: 1 1 0;
        min-width: 0;
        max-width: none;
    }
    .og-fake-doc-breadcrumb-container.protyle-breadcrumb>.protyle-breadcrumb__bar .protyle-breadcrumb__item:first-child::before {
        content: "";
        margin-right: 0px;
    }
    .og-fake-doc-breadcrumb-ellipsis {
        max-width: ${styleForEllipsisMaxWidth};
    }
    ${styleForv3_7_0}
    ${styleForHideNativeBreadcrumb}

    .og-fake-doc-breadcrumb-container .protyle-breadcrumb__text--ellipsis {
        max-width: unset;
    }

    .${CONSTANTS.MOBILE_CONTAINER_CLASS} {
        min-width: 0;
        overflow-x: auto;
        display: flex;
        align-items: center;
        font-size: 12px;
        max-width: min(40vw, 40%);
    }
    .${CONSTANTS.MOBILE_BUTTON_CLASS} {
        border: none;
        background: transparent;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        padding: 0 4px;
        text-align: left;
        display: inline-flex;
        align-items: center;
    }
    .${CONSTANTS.MOBILE_ADJ_BTN_CLASS} {
        flex-shrink: 0;
    }
    .${CONSTANTS.MOBILE_ADJ_BTN_CLASS}[${CONSTANTS.MOBILE_ADJ_DIRECTION_ATTR}="next"] {
        margin-left: 4px;
    }
    `;
    head.appendChild(style);
}

function styleEscape(str) {
    if (!str) return "";
    return str.replace(new RegExp("<[^<]*style[^>]*>", "g"), "");
}

export function removeStyle() {
    document.getElementById(CONSTANTS.STYLE_ID)?.remove();
}
