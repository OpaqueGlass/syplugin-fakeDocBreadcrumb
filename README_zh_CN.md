## fakeDocBreadcrumb （伪）文档面包屑

中文 | [English](README.md)

> 在编辑器上方显示当前文档路径信息的[思源笔记](https://github.com/siyuan-note/siyuan)插件。

> 当前版本：v0.2.13 **改进**：弃用sqlAPI，加快文档较多时的显示速度；**改进**：`>`菜单中当前文档样式跟随思源主题；**移除**：（设置项）“打开文档后定位到文档开头”、“超时重试次数”；
>
> 详见[更新日志](CHANGELOG.md)

### 快速开始

- 从集市下载 或 1、解压Release中的`package.zip`，2、将文件夹移动到`工作空间/data/plugins/`，3、并将文件夹重命名为`syplugin-fakeDocBreadcrumb`;
- 开启插件即可；
- 可以到插件设置页面浏览设置，**提示**：设置页可以上下滑动哦；

#### 说明

本插件：
- 不支持在移动端显示，请使用层级导航插件中的面包屑；
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
