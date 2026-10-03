import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { globalBroadcast } from "./globalBroadcast.js";
import { settingWindow } from "./captureWindow.js";
import { join } from "path";
import { ipcMain } from "electron";
import { UserConfig } from "./userConfig.js";
const log = () => {};
/**
 * 配置合并模块
 */
import { recursiveAssignment } from "./recursiveAssignment.js";
/**
 * 配置模板
 */
const configTemplate = require("../config/configTemplate.json");
/**
 * 插件配置文件夹路径
 */
const pluginDataPath = LiteLoader.plugins.lite_tools.path.data;
/**
 * 默认配置文件路径
 */
const defaultConfigPath = join(pluginDataPath, "config.json");
/**
 * 旧配置文件路径
 */
const oldConfigPath = join(pluginDataPath, "settings.json");
/**
 * 前置配置文件路径
 */
const userConfigPath = join(pluginDataPath, "user.json");
/**
 * 配置文件更新回调函数列表
 */
const addEventListenderList = new Set();
/**
 * 当前读取的配置文件夹路径
 */
let loadConfigPath;
/**
 * 当前读取的配置文件路径
 */
let configPath;
/**
 * 用户配置
 * @type {Object} 配置数据
 */
let config = {};
/**
 * 初始化配置文件夹
 */
if (!existsSync(pluginDataPath)) {
  mkdirSync(pluginDataPath, { recursive: true });
}
/**
 * 重命名旧的配置文件
 */
if (existsSync(oldConfigPath)) {
  renameSync(oldConfigPath, defaultConfigPath);
}
/**
 * 读取用户独立配置
 */
const userConfig = new UserConfig(userConfigPath);
/**
 * 加载用户配置
 * @param {String} userId 根据 userId 来判断读取哪个配置文件
 */
function loadUserConfig(userId) {
  /**
   * 独立配置文件路径
   */
  const standalonePath = userConfig.get(userId);
  let loadConfig;
  if (standalonePath) {
    log("找到独立配置");
    loadConfigPath = join(pluginDataPath, standalonePath);
  } else {
    log("使用默认配置");
    loadConfigPath = pluginDataPath;
  }
  configPath = join(loadConfigPath, "config.json");
  if (!existsSync(loadConfigPath)) {
    log("初始化配置目录");
    mkdirSync(loadConfigPath, { recursive: true });
    writeFileSync(configPath, JSON.stringify(configTemplate, null, 2));
  }
  try {
    loadConfig = require(configPath);
  } catch {
    log("读取配置文件失败，重置为默认配置");
    loadConfig = configTemplate;
    writeFileSync(configPath, JSON.stringify(configTemplate, null, 2));
  }
  updateConfig(recursiveAssignment(loadConfig, configTemplate));
}

/**
 * 推送配置更新
 */
function pushUpdate() {
  globalBroadcast("LiteLoader.lite_tools.updateOptions", config);
  addEventListenderList.forEach((callback) => callback(config));
}

/**
 * 添加配置更新监听
 * @param {Function} callback 配置更新回调
 */
function onUpdateConfig(callback) {
  addEventListenderList.add(callback);
}

/**
 * 更新配置文件
 * @param {Object} newConfig 新的配置文件
 */
function updateConfig(newConfig) {
  log("更新配置文件", newConfig);
  config = newConfig;
  writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
  pushUpdate();
}

/**
 * 启动时先按默认配置初始化
 *
 * 旧版本要等 proxySend 从 QQ 的 rmipc 载荷里探测到 uid 才会调用 loadUserConfig，
 * 该探测在新版 QQ 上可能永不命中，config 会一直是空对象：设置页读到空 options 后
 * 构建功能列表时抛错，只渲染出折叠标题；主进程功能同样静默失效。
 * 这里启动时就初始化一次，之后若探测命中，仍会照旧切换为该账号的独立配置。
 */
if (!Object.keys(config).length) {
  loadUserConfig(null);
}

/**
 * 初始化 ipcMain 监听
 */
ipcMain.on("LiteLoader.lite_tools.getOptions", (event) => {
  log("返回配置文件", config);
  event.returnValue = config;
});
ipcMain.on("LiteLoader.lite_tools.setOptions", (_, newConfig) => {
  updateConfig(newConfig);
});
ipcMain.handle("LiteLoader.lite_tools.getUserConfig", () => userConfig.list);

ipcMain.on("LiteLoader.lite_tools.deleteUserConfig", (_, uid) => {
  userConfig.delete(uid);
  settingWindow.webContents.send("LiteLoader.lite_tools.onToast", {
    content: `配置已更新，建议立即重启`,
    type: "success",
    duration: "3000",
  });
});

ipcMain.on("LiteLoader.lite_tools.addUserConfig", (_, uid, uin) => {
  userConfig.set(uid, uin);
  settingWindow.webContents.send("LiteLoader.lite_tools.onToast", {
    content: `配置已更新，建议立即重启`,
    type: "success",
    duration: "3000",
  });
});

export { config, userConfig, loadConfigPath, loadUserConfig, updateConfig, onUpdateConfig };
