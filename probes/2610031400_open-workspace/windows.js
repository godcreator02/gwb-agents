(() => {
  const { BrowserWindow } = process.getBuiltinModule('module').createRequire(process.execPath)('electron')
  return BrowserWindow.getAllWindows().map(window => ({
    id: window.id,
    title: window.getTitle(),
    visible: window.isVisible(),
    url: decodeURIComponent(window.webContents.getURL()).slice(-300),
  }))
})()
