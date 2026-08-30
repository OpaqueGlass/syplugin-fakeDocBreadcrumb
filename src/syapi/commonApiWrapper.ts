import { Config } from "siyuan";

/**
 * 获取思源设置
 * @returns 
 */
export function getSiyuanBaseConfig(): Config.IConf {
    return window?.siyuan?.config;
}