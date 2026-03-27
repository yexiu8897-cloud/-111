import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO, subDays, setHours, setMinutes, setSeconds, isAfter } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, Clock, CheckCircle2, Calendar as CalendarIcon, Layers, MapPin, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { LINES, ROLES, SHIFTS } from '../lib/constants';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';

export default function ShiftSelection() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [userInfo, setUserInfo] = useState<{ lineId?: string, shiftType?: string, roleId?: string, subRoleId?: string, englishName?: string, chineseName?: string } | null>(() => {
    const stored = localStorage.getItem('user_info');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (['ace', 'link', 'flow'].includes(parsed.lineId)) {
          parsed.lineId = 'ace_link_flow';
        }
        return parsed;
      } catch (e) {
        console.error("Failed to parse user info", e);
      }
    }
    return null;
  });
  const [otherShifts, setOtherShifts] = useState<any[]>([]);
  const [quotas, setQuotas] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    fetch('/api/quotas').then(r => r.json()).then(setQuotas).catch(console.error);
  }, []);

  useEffect(() => {
    const loadUserInfo = () => {
      const stored = localStorage.getItem('user_info');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (['ace', 'link', 'flow'].includes(parsed.lineId)) {
            parsed.lineId = 'ace_link_flow';
          }
          setUserInfo(parsed);
        } catch (e) {
          console.error("Failed to parse user info", e);
        }
      }
    };
    
    loadUserInfo();
    window.addEventListener('user_info_updated', loadUserInfo);
    
    return () => {
      window.removeEventListener('user_info_updated', loadUserInfo);
    };
  }, []);

  useEffect(() => {
    if (!date || !user) return;
    
    const fetchOtherShifts = async () => {
      try {
        const res = await fetch('/api/shifts');
        const allShifts = await res.json();
        
        if (!Array.isArray(allShifts)) {
          console.error("Failed to fetch other shifts:", allShifts.error || allShifts);
          return;
        }
        
        const shifts = allShifts.filter((s: any) => s.date === date && s.uid !== user.uid);
        setOtherShifts(shifts);
      } catch (error) {
        console.error("Failed to fetch other shifts", error);
      }
    };

    fetchOtherShifts();
    const interval = setInterval(fetchOtherShifts, 5000);
    return () => clearInterval(interval);
  }, [date, user]);

  const parsedDate = date ? parseISO(date) : new Date();
  const formattedDate = format(parsedDate, 'yyyy年MM月dd日 EEEE', { locale: zhCN });
  
  const roleId = userInfo?.roleId;
  const subRoleId = userInfo?.subRoleId;

  let roleName = ROLES.find(r => r.id === roleId)?.name || '未知岗位';
  if (roleId === 'writer' && subRoleId) {
    const subRoleName = subRoleId === 'online' ? '线上' : '线下';
    roleName += ` (${subRoleName})`;
  }

  let availableShifts = SHIFTS;
  if (userInfo?.shiftType === 'morning') {
    availableShifts = availableShifts.filter(s => s.name === '早班' || s.id === 'leave' || s.id === 'comp_leave');
  } else if (userInfo?.shiftType === 'night') {
    availableShifts = availableShifts.filter(s => s.name === '晚班' || s.id === 'leave' || s.id === 'comp_leave');
  }

  if (roleId === 'assistant') {
    availableShifts = availableShifts.filter(s => s.id === 'morning1' || s.name === '晚班' || s.id === 'leave' || s.id === 'comp_leave');
  }

  const getShiftAvailability = (shiftId: string) => {
    if (['leave', 'comp_leave'].includes(shiftId)) return { available: true, assignLine: userInfo?.lineId };
    
    const shiftQuotas = quotas[shiftId] || {};
    const isConfigured = Object.keys(shiftQuotas).length > 0;
    if (!isConfigured) return { available: true, assignLine: userInfo?.lineId };
    
    const counts: Record<string, number> = {};
    otherShifts.forEach(s => {
      if (s.shiftId === shiftId) {
        let sLine = s.lineId || 'none';
        if (['ace', 'link', 'flow'].includes(sLine)) sLine = 'ace_link_flow';
        const key = `${s.roleId}_${sLine}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    if (roleId === 'writer' && userInfo?.lineId === 'avbu') {
      const avbuQuota = shiftQuotas['writer_avbu'] || 0;
      const avbuCount = counts['writer_avbu'] || 0;
      if (avbuCount < avbuQuota) return { available: true, assignLine: 'avbu', remaining: avbuQuota - avbuCount };
      
      const nonAvbuQuota = shiftQuotas['writer_non-avbu'] || 0;
      const nonAvbuCount = counts['writer_non-avbu'] || 0;
      if (nonAvbuCount < nonAvbuQuota) return { available: true, assignLine: 'non-avbu', remaining: nonAvbuQuota - nonAvbuCount };
      
      return { available: false, reason: '名额已满' };
    } else {
      let myLine = userInfo?.lineId || 'none';
      if (['ace', 'link', 'flow'].includes(myLine)) myLine = 'ace_link_flow';
      const key = `${roleId}_${roleId === 'assistant' ? 'none' : myLine}`;
      const quota = shiftQuotas[key] || 0;
      const count = counts[key] || 0;
      if (count < quota) return { available: true, assignLine: userInfo?.lineId, remaining: quota - count };
      return { available: false, reason: '名额已满' };
    }
  };

  const isSubmitDisabled = !selectedShift || (selectedShift === 'leave' && !leaveReason.trim());

  const handleSubmit = async () => {
    if (isSubmitDisabled || !user || !date) return;
    
    const now = new Date();
    const cutoff = setSeconds(setMinutes(setHours(subDays(parsedDate, 1), 22), 0), 0);
    if (isAfter(now, cutoff)) {
      toast.error('抱歉，该日期的排班已于前一日 22:00 锁定，无法提交。');
      navigate('/');
      return;
    }

    try {
      // Re-read user info to ensure we have the latest data (e.g. if UserModal just closed)
      const stored = localStorage.getItem('user_info');
      let latestUserInfo = userInfo;
      if (stored) {
        try {
          latestUserInfo = JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse user info", e);
        }
      }

      const currentRoleId = latestUserInfo?.roleId;
      const currentSubRoleId = latestUserInfo?.subRoleId;
      const currentLineId = latestUserInfo?.lineId;
      const currentEnglishName = latestUserInfo?.englishName || '';
      const currentChineseName = latestUserInfo?.chineseName || '';

      const shiftDocId = `${date}_${user.uid}`;
      
      const availability = getShiftAvailability(selectedShift);
      if (!availability.available) {
        toast.error('抱歉，该班次名额已满，请选择其他班次。');
        return;
      }
      
      const finalLineId = availability.assignLine || currentLineId;
      
      const resolvedRoleName = ROLES.find(r => r.id === currentRoleId)?.name || '';
      const resolvedLineName = LINES.find(l => l.id === finalLineId)?.name || '';
      const resolvedShiftName = SHIFTS.find(s => s.id === selectedShift)?.name || '';
      
      const shiftData = {
        uid: user.uid,
        date: date,
        shiftId: selectedShift,
        roleId: currentRoleId || '',
        subRoleId: currentSubRoleId || '',
        lineId: finalLineId || '',
        leaveReason: selectedShift === 'leave' ? leaveReason.trim() : '',
        userName: currentChineseName || currentEnglishName || user.displayName || 'Unknown',
        roleName: resolvedRoleName,
        lineName: resolvedLineName,
        shiftName: resolvedShiftName,
        englishName: currentEnglishName,
        chineseName: currentChineseName,
        updatedAt: new Date().toISOString()
      };

      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftData)
      });

      if (!res.ok) {
        let errMessage = 'Failed to save shift';
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch (e) {}
        throw new Error(errMessage);
      }

      // Also save to localStorage for fallback/offline
      const existingShifts = JSON.parse(localStorage.getItem('my_shifts') || '{}');
      existingShifts[date] = shiftData;
      localStorage.setItem('my_shifts', JSON.stringify(existingShifts));

      const lineText = currentRoleId === 'assistant' ? '' : `\n条线: ${LINES.find(l => l.id === currentLineId)?.name || '未知'}`;
      const reasonText = selectedShift === 'leave' ? `\n请假原因: ${leaveReason.trim()}` : '';
      toast.success(`排班提交成功！\n日期: ${formattedDate}${lineText}\n岗位: ${resolvedRoleName}\n班次: ${SHIFTS.find(s => s.id === selectedShift)?.name}${reasonText}`);
      navigate('/');
    } catch (error: any) {
      console.error('Error saving shift:', error);
      toast.error('保存排班失败，请重试: ' + (error.message || error));
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-white text-gray-800 p-4 pt-8 shadow-sm flex items-center sticky top-0 z-10">
        <button 
          onClick={() => navigate('/')}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold ml-2">选择班次</h1>
      </header>
      
      <main className="flex-1 p-4 overflow-y-auto pb-24">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">排班日期</p>
              <p className="text-sm text-gray-800 font-semibold">{formattedDate}</p>
            </div>
          </div>
          {roleId !== 'assistant' && userInfo?.lineId && (
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">已选条线</p>
                <p className="text-sm text-gray-800 font-semibold">{LINES.find(l => l.id === userInfo.lineId)?.name}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">已选岗位</p>
              <p className="text-sm text-gray-800 font-semibold">{roleName}</p>
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            选择班次
          </h2>
          <div className="space-y-3">
            {availableShifts.map(shift => {
              const availability = getShiftAvailability(shift.id);
              const isFull = !availability.available;
              
              return (
                <div key={shift.id}>
                  <div 
                    onClick={() => {
                      if (isFull) return;
                      setSelectedShift(shift.id);
                      if (shift.id !== 'leave') {
                        setLeaveReason('');
                      }
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all flex justify-between items-center",
                      isFull ? "opacity-50 cursor-not-allowed bg-gray-50 border-gray-200" : "cursor-pointer",
                      !isFull && selectedShift === shift.id 
                        ? "border-blue-500 bg-blue-50" 
                        : !isFull ? "border-transparent bg-white shadow-sm hover:border-blue-200" : ""
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{shift.name}</h3>
                        {availability.remaining !== undefined && !isFull && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                            余 {availability.remaining}
                          </span>
                        )}
                        {isFull && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                            已满
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{shift.time}</p>
                    </div>
                    {selectedShift === shift.id && !isFull && (
                      <CheckCircle2 className="w-6 h-6 text-blue-500" />
                    )}
                  </div>
                  {selectedShift === 'leave' && shift.id === 'leave' && (
                    <div className="mt-2 p-4 bg-white rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <label htmlFor="leaveReason" className="block text-sm font-medium text-gray-700 mb-2">
                      请假原因 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="leaveReason"
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      placeholder="请输入请假原因..."
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-24 text-sm"
                      required
                    />
                  </div>
                )}
              </div>
            );
          })}
            {availableShifts.length === 0 && (
              <div className="p-4 text-center text-gray-500 bg-white rounded-xl shadow-sm">
                暂无可用的班次
              </div>
            )}
          </div>
        </section>

        {otherShifts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              当日其他排班同事
            </h2>
            <div className="space-y-2">
              {otherShifts.map((shift, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {shift.chineseName && shift.englishName ? `${shift.chineseName} (${shift.englishName})` : shift.userName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {shift.roleName || ROLES.find(r => r.id === shift.roleId)?.name}
                      {shift.lineId ? ` · ${shift.lineName || LINES.find(l => l.id === shift.lineId)?.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-md font-medium",
                      shift.shiftId === 'leave' ? "bg-red-100 text-red-700" :
                      shift.shiftId === 'comp_leave' ? "bg-purple-100 text-purple-700" :
                      "bg-blue-100 text-blue-700"
                    )}>
                      {shift.shiftName || SHIFTS.find(s => s.id === shift.shiftId)?.name || shift.shiftId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex justify-center">
        <div className="w-full max-w-md">
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={cn(
              "w-full py-3.5 rounded-xl font-semibold text-white transition-all shadow-md",
              !isSubmitDisabled
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
                : "bg-gray-300 cursor-not-allowed shadow-none"
            )}
          >
            确认排班
          </button>
        </div>
      </div>
    </div>
  );
}
