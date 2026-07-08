const FORM_CONFIG = {
  title: '停車場設備功能測試完成簽認單',
  basicFields: [
    { key: 'projectName', label: '案場名稱', type: 'text', required: true },
    { key: 'siteCode', label: '場地代號', type: 'text', required: false },
    { key: 'checkDate', label: '檢查日期', type: 'date', required: true },
    { key: 'testerName', label: '測試人員', type: 'text', required: false },
    { key: 'ownerName', label: '業主／現場代表', type: 'text', required: false },
  ],
  deviceTypes: {
    entrance: {
      label: '入口',
      items: [
        '車牌辨識',
        '臨停入場',
        '月租入場',
        '柵欄機開啟',
        '柵欄機關閉',
        '遠端開閘',
      ],
    },
    exit: {
      label: '出口',
      items: [
        '車牌辨識',
        '臨停出場',
        '月租出場',
        '已繳費放行',
        '未繳費攔阻',
        '柵欄機開啟',
        '柵欄機關閉',
        '遠端開閘',
      ],
    },
    payment: {
      label: '繳費機',
      items: [
        '入車資料查詢',
        '現金付款',
        '信用卡付款',
        '電子票證付款',
        '行動支付',
        '折扣功能',
        '發票列印',
        '對講功能',
      ],
    },
    control: {
      label: '中控',
      items: [
        '場地資料設定',
        '費率設定',
        '月租資料設定',
        '設備連線確認',
        '圖控操作',
        '報表查詢',
        '遠端連線',
      ],
    },
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.FORM_CONFIG = FORM_CONFIG;
}
