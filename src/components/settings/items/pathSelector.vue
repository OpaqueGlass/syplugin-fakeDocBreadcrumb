<template>
    <button class="b3-button b3-button--outline fn__size200 fn__flex-center" @click="doIt">
        Select
    </button>
</template>
<script lang="ts" setup>
import { errorPush } from '@/logger';
import { showPluginMessage } from '@/utils/common';
import { lang } from '@/utils/lang';


const model = defineModel();

const doIt = ()=>{
    const remote = window.require("@electron/remote");
    if (remote && remote.dialog) {
        remote.dialog.showOpenDialog({
            title: lang("select_path"),
            properties: ["dontAddToRecent", "openFile"],
        }).then((path)=>{
            if (path && path.filePaths.length > 0) {
                model.value = path.filePaths[0];
            } else {
                showPluginMessage(lang("msg_not_select_path"));
            }
        }).catch((err)=>{
            errorPush("选文件夹时错误", err);
        })
    } else {
        showPluginMessage(lang("only_available_in_client"));
    }
}

</script>