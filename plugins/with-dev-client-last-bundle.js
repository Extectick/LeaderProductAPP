const {withAndroidManifest,AndroidConfig}=require('@expo/config-plugins');

// Expo's plugin only adds the false flag for launcher mode and leaves it behind
// on incremental prebuilds. Set the selected behavior explicitly for Dev Client.
module.exports=config=>withAndroidManifest(config,mod=>{
  const application=AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application,'DEV_CLIENT_TRY_TO_LAUNCH_LAST_BUNDLE','true');
  return mod;
});
