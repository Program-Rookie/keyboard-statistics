import * as echarts from 'echarts';

// 初始化图表
const keyDistributionChart = echarts.init(document.getElementById('keyDistribution'));
const timeDistributionChart = echarts.init(document.getElementById('timeDistribution'));

// 图表配置
const keyDistributionOption = {
    title: {
        text: '按键分布'
    },
    tooltip: {
        trigger: 'item'
    },
    series: [{
        type: 'pie',
        radius: '50%',
        data: []
    }]
};

const timeDistributionOption = {
    title: {
        text: '时间分布'
    },
    tooltip: {
        trigger: 'axis'
    },
    xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => `${i}:00`)
    },
    yAxis: {
        type: 'value'
    },
    series: [{
        type: 'line',
        data: Array(24).fill(0)
    }]
};

// 初始化图表
keyDistributionChart.setOption(keyDistributionOption);
timeDistributionChart.setOption(timeDistributionOption);

// 按钮事件处理
document.getElementById('startBtn').addEventListener('click', async() => {
    try {
        await window.__TAURI__.invoke('start_recording');
        console.log('开始记录');
    } catch (error) {
        console.error('启动失败:', error);
    }
});

document.getElementById('stopBtn').addEventListener('click', async() => {
    try {
        await window.__TAURI__.invoke('stop_recording');
        console.log('停止记录');
    } catch (error) {
        console.error('停止失败:', error);
    }
});

document.getElementById('exportBtn').addEventListener('click', async() => {
    try {
        await window.__TAURI__.invoke('export_data');
        console.log('数据导出成功');
    } catch (error) {
        console.error('导出失败:', error);
    }
});

// 监听窗口大小变化，调整图表大小
window.addEventListener('resize', () => {
    keyDistributionChart.resize();
    timeDistributionChart.resize();
});