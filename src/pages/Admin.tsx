import React, { useState, useEffect } from 'react';
import { ChevronLeft, Save, ShieldAlert, Calendar, Users, CalendarDays, ChevronDown, ChevronRight, KeyRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROLES, LINES, SHIFTS } from '../lib/constants';
import { format, addDays, isAfter, setHours, setMinutes, setSeconds } from 'date-fns';
import { toast } from 'sonner';

export default function Admin() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [quotas, setQuotas] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'quotas' | 'stats' | 'preview'>('quotas');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Stats state
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const cutoff = setSeconds(setMinutes(setHours(now, 22), 0), 0);
    return format(isAfter(now, cutoff) ? addDays(now, 1) : now, 'yyyy-MM-dd');
  });

  const previewDates = Array.from({ length: 7 }).map((_, i) => {
    const now = new Date();
    const cutoff = setSeconds(setMinutes(setHours(now, 22), 0), 0);
    const baseDateObj = isAfter(now, cutoff) ? addDays(now, 1) : now;
    const d = addDays(baseDateObj, i + 1);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return {
      date: format(d, 'yyyy-MM-dd'),
      label: `${format(d, 'MM月dd日')} ${days[d.getDay()]}`
    };
  });
  const [shiftsData, setShiftsData] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedPreviewDate, setExpandedPreviewDate] = useState<string | null>(null);

  const shiftOptions = SHIFTS.filter(s => !['leave', 'comp_leave'].includes(s.id));
  const morningShifts = shiftOptions.filter(s => s.name === '早班');
  const nightShifts = shiftOptions.filter(s => s.name === '晚班');
  
  const roleLineCombinations = [
    { roleId: 'publisher', lineId: 'avbu', name: 'AVBU', group: '发布岗' },
    { roleId: 'publisher', lineId: 'x', name: 'X', group: '发布岗' },
    { roleId: 'publisher', lineId: 'ace_link_flow', name: 'ACE / LINK / flow', group: '发布岗' },
    { roleId: 'publisher', lineId: 'go', name: 'GO', group: '发布岗' },
    { roleId: 'writer', lineId: 'avbu', name: 'AVBU', group: '撰写岗' },
    { roleId: 'writer', lineId: 'non-avbu', name: '非AVBU', group: '撰写岗' },
    { roleId: 'assistant', lineId: 'none', name: '全条线', group: '条线组长助理' },
  ];

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuotas();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && (activeTab === 'stats' || activeTab === 'preview')) {
      fetchStats();
    }
  }, [isAuthenticated, activeTab, selectedDate]);

  const fetchQuotas = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quotas');
      const data = await res.json();
      setQuotas(data);
    } catch (error) {
      console.error('Failed to fetch quotas', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      if (activeTab === 'stats') {
        const res = await fetch(`/api/shifts?date=${selectedDate}`);
        const data = await res.json();
        // Filter by selected date (just in case the server didn't filter)
        const filtered = data.filter((s: any) => s.date === selectedDate);
        setShiftsData(filtered);
      } else if (activeTab === 'preview') {
        const dates = previewDates.map(d => d.date);
        const promises = dates.map(d => fetch(`/api/shifts?date=${d}`).then(r => r.json()));
        const results = await Promise.all(promises);
        setShiftsData(results.flat());
      }
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const copySchedule = () => {
    let text = `排班表 (${selectedDate})\n\n`;
    
    ['发布岗', '撰写岗', '条线组长助理'].forEach(groupName => {
      const combos = roleLineCombinations.filter(c => c.group === groupName);
      combos.forEach(combo => {
        text += `【${groupName} - ${combo.name}】\n`;
        
        const comboKey = `${combo.roleId}_${combo.lineId}`;
        
        // Morning shifts
        morningShifts.forEach(shift => {
          const usersInShift = shiftsData.filter(s => {
            if (s.shiftId !== shift.id) return false;
            let sLine = s.lineId || 'none';
            if (['ace', 'link', 'flow'].includes(sLine)) sLine = 'ace_link_flow';
            return s.roleId === combo.roleId && sLine === combo.lineId;
          });
          if (usersInShift.length > 0) {
            const userNames = usersInShift.map(u => {
              let name = u.userName;
              if (combo.lineId === 'ace_link_flow' && u.lineId) {
                const lineObj = LINES.find(l => l.id === u.lineId);
                if (lineObj) name += `(${lineObj.name})`;
              }
              return name;
            }).join(', ');
            text += `${shift.name}(${shift.time}): ${userNames}\n`;
          }
        });
        
        // Night shifts
        nightShifts.forEach(shift => {
          const usersInShift = shiftsData.filter(s => {
            if (s.shiftId !== shift.id) return false;
            let sLine = s.lineId || 'none';
            if (['ace', 'link', 'flow'].includes(sLine)) sLine = 'ace_link_flow';
            return s.roleId === combo.roleId && sLine === combo.lineId;
          });
          if (usersInShift.length > 0) {
            const userNames = usersInShift.map(u => {
              let name = u.userName;
              if (combo.lineId === 'ace_link_flow' && u.lineId) {
                const lineObj = LINES.find(l => l.id === u.lineId);
                if (lineObj) name += `(${lineObj.name})`;
              }
              return name;
            }).join(', ');
            text += `${shift.name}(${shift.time}): ${userNames}\n`;
          }
        });
        text += '\n';
      });
    });
    
    navigator.clipboard.writeText(text).then(() => {
      toast.success('排班表已复制到剪贴板');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      toast.error('复制失败，请手动复制');
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        toast.error('密码错误');
      }
    } catch (err) {
      toast.error('登录失败，请重试');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error('两次输入的新密码不一致');
    }
    if (!newPassword) {
      return toast.error('新密码不能为空');
    }
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('密码修改成功！');
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || '密码修改失败');
      }
    } catch (err) {
      toast.error('密码修改失败，请重试');
    }
  };

  const handleQuotaChange = (shiftId: string, combinationKey: string, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setQuotas(prev => ({
      ...prev,
      [shiftId]: {
        ...(prev[shiftId] || {}),
        [combinationKey]: numValue
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotas)
      });
      if (res.ok) {
        toast.success('保存成功！');
      } else {
        toast.error('保存失败');
      }
    } catch (error) {
      console.error('Failed to save quotas', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderShiftTable = (dateStr: string, title?: string) => {
    const dataForDate = shiftsData.filter(s => s.date === dateStr);
    return (
      <div key={dateStr} className={title ? "mb-10" : ""}>
        {title && <h3 className="text-lg font-bold text-gray-800 mb-4 pl-3 border-l-4 border-blue-500">{title}</h3>}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th rowSpan={2} className="px-4 py-3 font-medium text-gray-700 sticky left-0 bg-gray-50 z-30 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                    岗位
                  </th>
                  <th rowSpan={2} className="px-4 py-3 font-medium text-gray-700 sticky left-24 bg-gray-50 z-30 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                    条线
                  </th>
                  {morningShifts.length > 0 && (
                    <th colSpan={morningShifts.length} className="px-4 py-2 font-bold text-blue-800 text-center border-b border-gray-200 bg-blue-50/50">
                      早班
                    </th>
                  )}
                  {nightShifts.length > 0 && (
                    <th colSpan={nightShifts.length} className="px-4 py-2 font-bold text-indigo-800 text-center border-b border-gray-200 bg-indigo-50/50 border-l border-gray-200">
                      晚班
                    </th>
                  )}
                </tr>
                <tr>
                  {morningShifts.map(shift => (
                    <th key={shift.id} className="px-4 py-2 font-medium text-gray-600 text-center min-w-[100px] text-xs bg-gray-50">
                      {shift.time}
                    </th>
                  ))}
                  {nightShifts.map(shift => (
                    <th key={shift.id} className="px-4 py-2 font-medium text-gray-600 text-center min-w-[100px] text-xs border-l border-gray-200 bg-gray-50">
                      {shift.time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {['发布岗', '撰写岗', '条线组长助理'].map(groupName => {
                  const combos = roleLineCombinations.filter(c => c.group === groupName);
                  return combos.map((combo, index) => {
                    const comboKey = `${combo.roleId}_${combo.lineId}`;
                    return (
                      <tr key={comboKey} className="hover:bg-gray-50 transition-colors">
                        {index === 0 && (
                          <td rowSpan={combos.length} className="px-4 py-3 font-bold text-gray-800 sticky left-0 bg-white z-20 border-r border-b border-gray-200 align-middle w-24 min-w-[6rem] text-center whitespace-normal shadow-[1px_0_0_#e5e7eb]">
                            {groupName}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium text-gray-600 sticky left-24 bg-white z-20 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                          {combo.name}
                        </td>
                        {morningShifts.map(shift => {
                          const usersInShift = dataForDate.filter(s => {
                            if (s.shiftId !== shift.id) return false;
                            let sLine = s.lineId || 'none';
                            if (['ace', 'link', 'flow'].includes(sLine)) sLine = 'ace_link_flow';
                            return s.roleId === combo.roleId && sLine === combo.lineId;
                          });
                          
                          return (
                            <td key={shift.id} className="px-4 py-3 text-center align-middle min-w-[120px]">
                              {usersInShift.length > 0 ? (
                                <div className="text-sm text-gray-800 whitespace-normal leading-relaxed">
                                  {usersInShift.map((u) => {
                                    let displayName = u.userName;
                                    if (combo.lineId === 'ace_link_flow' && u.lineId) {
                                      const lineObj = LINES.find(l => l.id === u.lineId);
                                      if (lineObj) displayName += `(${lineObj.name})`;
                                    }
                                    return displayName;
                                  }).join('，')}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">-</span>
                              )}
                            </td>
                          );
                        })}
                        {nightShifts.map(shift => {
                          const usersInShift = dataForDate.filter(s => {
                            if (s.shiftId !== shift.id) return false;
                            let sLine = s.lineId || 'none';
                            if (['ace', 'link', 'flow'].includes(sLine)) sLine = 'ace_link_flow';
                            return s.roleId === combo.roleId && sLine === combo.lineId;
                          });

                          return (
                            <td key={shift.id} className="px-4 py-3 text-center border-l border-gray-200 bg-gray-50/30 align-middle min-w-[120px]">
                              {usersInShift.length > 0 ? (
                                <div className="text-sm text-gray-800 whitespace-normal leading-relaxed">
                                  {usersInShift.map((u) => {
                                    let displayName = u.userName;
                                    if (combo.lineId === 'ace_link_flow' && u.lineId) {
                                      const lineObj = LINES.find(l => l.id === u.lineId);
                                      if (lineObj) displayName += `(${lineObj.name})`;
                                    }
                                    return displayName;
                                  }).join('，')}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full bg-gray-50 items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm text-center">
          <ShieldAlert className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-6 text-gray-800">管理员登录</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="请输入管理员密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-center"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md active:scale-[0.98]"
            >
              登录
            </button>
          </form>
          <button onClick={() => navigate('/')} className="mt-4 text-sm text-gray-500 hover:text-gray-700">返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-white text-gray-800 p-4 pt-8 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/')}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold ml-2">管理员后台</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            <span className="hidden sm:inline">修改密码</span>
          </button>
          {activeTab === 'quotas' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-4 flex gap-6">
        <button
          onClick={() => setActiveTab('quotas')}
          className={`py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'quotas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          排班名额设置
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'stats' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          今日排班表
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'preview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          未来7天预览
        </button>
      </div>

      <main className="flex-1 p-4 overflow-y-auto pb-10">
        {activeTab === 'quotas' && (
          <>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p><strong>全局名额设置：</strong>此处设置的名额为每日默认上限。设置一次后每天生效，无需每日重复设置，仅在需要调整时修改即可。</p>
            </div>

            {loading ? (
              <div className="text-center py-10 text-gray-500">加载中...</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th rowSpan={2} className="px-4 py-3 font-medium text-gray-700 sticky left-0 bg-gray-50 z-30 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                          岗位
                        </th>
                        <th rowSpan={2} className="px-4 py-3 font-medium text-gray-700 sticky left-24 bg-gray-50 z-30 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                          条线
                        </th>
                        {morningShifts.length > 0 && (
                          <th colSpan={morningShifts.length} className="px-4 py-2 font-bold text-blue-800 text-center border-b border-gray-200 bg-blue-50/50">
                            早班
                          </th>
                        )}
                        {nightShifts.length > 0 && (
                          <th colSpan={nightShifts.length} className="px-4 py-2 font-bold text-indigo-800 text-center border-b border-gray-200 bg-indigo-50/50 border-l border-gray-200">
                            晚班
                          </th>
                        )}
                      </tr>
                      <tr>
                        {morningShifts.map(shift => (
                          <th key={shift.id} className="px-4 py-2 font-medium text-gray-600 text-center min-w-[100px] text-xs bg-gray-50">
                            {shift.time}
                          </th>
                        ))}
                        {nightShifts.map(shift => (
                          <th key={shift.id} className="px-4 py-2 font-medium text-gray-600 text-center min-w-[100px] text-xs border-l border-gray-200 bg-gray-50">
                            {shift.time}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {['发布岗', '撰写岗', '条线组长助理'].map(groupName => {
                        const combos = roleLineCombinations.filter(c => c.group === groupName);
                        return combos.map((combo, index) => {
                          const comboKey = `${combo.roleId}_${combo.lineId}`;
                          return (
                            <tr key={comboKey} className="hover:bg-gray-50 transition-colors">
                              {index === 0 && (
                                <td rowSpan={combos.length} className="px-4 py-3 font-bold text-gray-800 sticky left-0 bg-white z-20 border-r border-b border-gray-200 align-middle w-24 min-w-[6rem] text-center whitespace-normal shadow-[1px_0_0_#e5e7eb]">
                                  {groupName}
                                </td>
                              )}
                              <td className="px-4 py-3 font-medium text-gray-600 sticky left-24 bg-white z-20 border-r border-gray-200 align-middle w-24 min-w-[6rem] text-center shadow-[1px_0_0_#e5e7eb]">
                                {combo.name}
                              </td>
                                {morningShifts.map(shift => {
                                  const value = quotas[shift.id]?.[comboKey] || 0;
                                  return (
                                    <td key={shift.id} className="px-4 py-2 text-center">
                                      <input
                                        type="number"
                                        min="0"
                                        value={value}
                                        onChange={(e) => handleQuotaChange(shift.id, comboKey, e.target.value)}
                                        className="w-16 p-1.5 text-center rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                      />
                                    </td>
                                  );
                                })}
                                {nightShifts.map(shift => {
                                  const value = quotas[shift.id]?.[comboKey] || 0;
                                  return (
                                    <td key={shift.id} className="px-4 py-2 text-center border-l border-gray-200 bg-gray-50/30">
                                      <input
                                        type="number"
                                        min="0"
                                        value={value}
                                        onChange={(e) => handleQuotaChange(shift.id, comboKey, e.target.value)}
                                        className="w-16 p-1.5 text-center rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        
        {activeTab === 'stats' && (
          <>
            <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-700">选择日期</span>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="ml-2 p-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <button
                onClick={copySchedule}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                复制排班表
              </button>
            </div>

            {loadingStats ? (
              <div className="text-center py-10 text-gray-500">加载中...</div>
            ) : (
              renderShiftTable(selectedDate)
            )}
          </>
        )}

        {activeTab === 'preview' && (
          <>
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800 flex items-start gap-3">
              <CalendarDays className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed"><strong>未来7天排班预览：</strong>此处展示从明天起未来7天的排班情况。员工仍在选班中，数据可能会实时变动，仅供预览参考。</p>
            </div>
            
            {loadingStats ? (
              <div className="text-center py-10 text-gray-500">加载中...</div>
            ) : (
              <div className="space-y-4">
                {previewDates.map(d => (
                  <div key={d.date} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => setExpandedPreviewDate(prev => prev === d.date ? null : d.date)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="font-bold text-gray-800 text-lg">{d.label} 排班表</span>
                      {expandedPreviewDate === d.date ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                    {expandedPreviewDate === d.date && (
                      <div className="p-4 pt-0 border-t border-gray-100">
                        {renderShiftTable(d.date)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                修改管理员密码
              </h3>
              <button 
                onClick={() => setShowPasswordModal(false)}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md active:scale-[0.98] mt-2"
              >
                确认修改
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
