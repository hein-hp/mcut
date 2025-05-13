const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 处理选择输入文件
ipcMain.handle('select-input-file', async (event, fileType) => {
  const extensions = fileType === 'mkv' ? ['mkv'] : ['mp4', 'avi', 'mov', 'mkv'];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: extensions }
    ]
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// 处理选择输出文件
ipcMain.handle('select-output-file', async (event, defaultName, extension) => {
  // 设置文件过滤器，默认为MP4
  let filters = [
    { name: 'MP4 文件', extensions: ['mp4'] }
  ];
  
  // 如果提供了特定扩展名，使用该扩展名作为过滤器
  if (extension) {
    // 移除前导点号(如果有)
    const ext = extension.startsWith('.') ? extension.substring(1) : extension;
    filters = [
      { name: `${ext.toUpperCase()} 文件`, extensions: [ext] }
    ];
  }
  
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePath;
});

// 处理选择输出目录
ipcMain.handle('select-output-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// 处理单段视频剪切
ipcMain.handle('cut-video', async (event, { inputPath, outputPath, startTime, endTime }) => {
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i "${inputPath}" -ss ${startTime} -to ${endTime} -c:v copy "${outputPath}"`;
    
    mainWindow.webContents.send('log', `执行命令: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行错误: ${error}`);
        mainWindow.webContents.send('log', `错误: ${error.message}`);
        reject(error.message);
        return;
      }
      
      mainWindow.webContents.send('log', '视频剪切完成!');
      resolve('视频剪切成功');
    });
  });
});

// 处理多段视频剪切
ipcMain.handle('cut-multiple-segments', async (event, { inputPath, outputDir, segments }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let successCount = 0;
      let failCount = 0;
      
      mainWindow.webContents.send('log', `开始批量处理 ${segments.length} 个视频片段...`);
      
      // 创建临时文件列表，用于后续合并
      const tmpFilePaths = [];
      
      // 处理每个片段
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const { startTime, endTime, label } = segment;
        
        // 获取原始文件扩展名
        const fileExt = path.extname(inputPath);
        
        // 生成输出文件名
        const fileName = label ? 
          `${path.basename(inputPath, path.extname(inputPath))}_${label}${fileExt}` : 
          `${path.basename(inputPath, path.extname(inputPath))}_segment${i+1}${fileExt}`;
        
        const outputPath = path.join(outputDir, fileName);
        tmpFilePaths.push(outputPath);
        
        // 构建命令
        const command = `ffmpeg -i "${inputPath}" -ss ${startTime} -to ${endTime} -c:v copy "${outputPath}"`;
        
        mainWindow.webContents.send('log', `处理片段 ${i+1}/${segments.length}: ${startTime} 到 ${endTime}`);
        mainWindow.webContents.send('log', `执行命令: ${command}`);
        
        try {
          // 执行命令
          await new Promise((cmdResolve, cmdReject) => {
            exec(command, (error) => {
              if (error) {
                cmdReject(error);
                return;
              }
              cmdResolve();
            });
          });
          
          mainWindow.webContents.send('log', `片段 ${i+1} 剪切成功: ${outputPath}`);
          successCount++;
        } catch (err) {
          mainWindow.webContents.send('log', `片段 ${i+1} 剪切失败: ${err.message}`);
          failCount++;
        }
      }
      
      mainWindow.webContents.send('log', `批量剪切完成，成功: ${successCount} 个，失败: ${failCount} 个`);
      resolve({
        success: successCount,
        fail: failCount,
        total: segments.length
      });
    } catch (error) {
      mainWindow.webContents.send('log', `批量处理出错: ${error.message}`);
      reject(error.message);
    }
  });
});

// 处理MKV转MP4
ipcMain.handle('convert-mkv', async (event, { inputPath, outputPath }) => {
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i "${inputPath}" -vcodec copy -acodec aac "${outputPath}"`;
    
    mainWindow.webContents.send('log', `执行命令: ${command}`);
    
    exec(command, (error) => {
      if (error) {
        console.error(`执行错误: ${error}`);
        mainWindow.webContents.send('log', `错误: ${error.message}`);
        reject(error.message);
        return;
      }
      
      mainWindow.webContents.send('log', 'MKV转MP4完成!');
      resolve('MKV转MP4成功');
    });
  });
});

// 处理导出配置到JSON文件
ipcMain.handle('export-config', async (event, { configData, defaultName }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'mcut_config.json',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] }
      ]
    });
    
    if (result.canceled) {
      return null;
    }
    
    // 写入文件
    fs.writeFileSync(result.filePath, JSON.stringify(configData, null, 2), 'utf-8');
    mainWindow.webContents.send('log', `配置已导出到: ${result.filePath}`);
    return result.filePath;
  } catch (error) {
    mainWindow.webContents.send('log', `导出配置失败: ${error.message}`);
    throw error;
  }
});

// 处理从JSON文件导入配置
ipcMain.handle('import-config', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'JSON 文件', extensions: ['json'] }
      ]
    });
    
    if (result.canceled) {
      return null;
    }
    
    // 读取文件
    const configData = fs.readFileSync(result.filePaths[0], 'utf-8');
    const parsedData = JSON.parse(configData);
    mainWindow.webContents.send('log', `配置已从 ${result.filePaths[0]} 导入`);
    return parsedData;
  } catch (error) {
    mainWindow.webContents.send('log', `导入配置失败: ${error.message}`);
    throw error;
  }
}); 