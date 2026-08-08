/**
 * ApplierFactory - 应用器工厂
 * 根据设置和页面类型选择合适的 Applier
 */

import { BreadcrumbApplier } from "./ApplierBase";
import { SingleLineApplier } from "./SingleLineApplier";
import { MultiLineApplier } from "./MultiLineApplier";

export class ApplierFactory {
    static create(setting: any, providers: IBreadcrumbProvider[], isCardPage: boolean): BreadcrumbApplier {
        // 抽认卡页面强制多行
        if (setting.oneLineBreadcrumb && !isCardPage) {
            return new SingleLineApplier(providers);
        }
        return new MultiLineApplier(providers);
    }
}
