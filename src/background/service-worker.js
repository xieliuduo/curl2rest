// 点击插件图标 → 打开标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/tab/tab.html") });
});
