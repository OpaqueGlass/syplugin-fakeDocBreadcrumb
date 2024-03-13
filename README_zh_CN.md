## fakeDocBreadcrumb （伪）文档面包屑

[English README](README.md)

> 当前版本：v0.2.13 **修复**：启用”允许显示浮窗“后，面包屑点击行为异常的问题；**修复**：点击笔记本后，页签被关闭的问题；**新增**：子文档菜单中的文档图标；
其他详见[更新日志](CHANGELOG.md)

### 快速开始

- 从集市下载 或 1、解压Release中的`package.zip`，2、将文件夹移动到`工作空间/data/plugins/`，3、并将文件夹重命名为`syplugin-fakeDocBreadcrumb`;
- 开启插件即可；
- 可以到插件设置页面浏览设置，**提示**：设置页可以上下滑动哦；

#### 说明

本插件：
- ~~不支持鼠标悬停时显示浮窗~~ 自v0.2.6起为可选项；
- 受限于手机端显示能力，仅显示后3层级；
- 导致原有的块面包屑和“更多”操作选项下移；
- 如果主题将面包屑中文档间的分隔符显示为“/”，可能无法点击显示子文档选择菜单，需要在设置项中启用“覆盖主题面包屑分隔符“>”样式”；

## 反馈bug

（推荐）请前往[github仓库](https://github.com/OpaqueGlass/syplugin-fakeDocBreadcrumb)反馈问题。

如果您无法访问github，请[在此反馈](https://wj.qq.com/s2/12395364/b69f/)。

### 参考&感谢

| 开发者/项目                                                  | 描述                                                         | 说明         |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------ |
| [leolee9086](https://github.com/leolee9086) / [cc-template](https://github.com/leolee9086/cc-template) | 使用挂件渲染模板；[木兰宽松许可证， 第2版](https://github.com/leolee9086/cc-template/blob/main/LICENSE) | 点击打开文档 |
| [zuoez02](https://github.com/zuoez02)/[siyuan-plugin-system](https://github.com/zuoez02/siyuan-plugin-system) | 插件系统                                                     |              |
