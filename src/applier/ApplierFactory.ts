/**
 * ApplierFactory - 应用器工厂
 * 根据设置和页面类型选择合适的 Applier
 */

import { isMobile } from "@/syapi";
import { BreadcrumbApplier } from "./ApplierBase";
import { SingleLineApplier } from "./SingleLineApplier";
import { MultiLineApplier } from "./MultiLineApplier";
import { MobileApplier } from "./MobileApplier";
import { debugPush } from "@/logger";

export class ApplierFactory {
    static create(setting: any, providers: IBreadcrumbProvider[], isCardPage: boolean): BreadcrumbApplier {
        // 移动端使用专用 Applier，isCardPage 等桌面布局概念不适用
        if (isMobile()) {
            debugPush("移动端使用 MobileApplier");
            return new MobileApplier(providers);
        }
        // 抽认卡页面强制多行
        if (setting.oneLineBreadcrumb && !isCardPage) {
            return new SingleLineApplier(providers);
        }
        return new MultiLineApplier(providers);
    }
}
