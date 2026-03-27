import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from '../components/Calendar';
import { Calendar as CalendarIcon, Users, X, Layers, MapPin, Clock } from 'lucide-react';
import { format, subDays, setHours, setMinutes, setSeconds, isAfter } from 'date-fns';
import { cn } from '../lib/utils';
import { LINES, ROLES, SHIFTS } from '../lib/constants';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [existingShift, setExistingShift] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [myShifts, setMyShifts] = useState<Record<string, any>>({});
  const [allShifts, setAllShifts] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!user) return;
    
    // Fetch all shifts for collaboration
    const fetchShifts = async () => {
      try {
        const res = await fetch('/api/shifts');
        const shifts = await res.json();
        
        if (!Array.isArray(shifts)) {
          console.error("Failed to fetch shifts:", shifts.error || shifts);
          return;
        }
        
        const myShiftsMap: Record<string, any> = {};
        const allShiftsMap: Record<string, any[]> = {};
        
        shifts.forEach((data: any) => {
          // Group all shifts by date
          if (!allShiftsMap[data.date]) {
            allShiftsMap[data.date] = [];
          }
          allShiftsMap[data.date].push(data);
          
          // Track my shifts
          if (data.uid === user.uid) {
            myShiftsMap[data.date] = data;
          }
        });
        
        setAllShifts(allShiftsMap);
        setMyShifts(myShiftsMap);
        // Also update localStorage for fallback
        localStorage.setItem('my_shifts', JSON.stringify(myShiftsMap));
      } catch (error) {
        console.error("Failed to fetch shifts", error);
        // Fallback to local storage
        const localShifts = JSON.parse(localStorage.getItem('my_shifts') || '{}');
        setMyShifts(localShifts);
      }
    };

    fetchShifts();
    const interval = setInterval(fetchShifts, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleDateSelect = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const now = new Date();
    const cutoff = setSeconds(setMinutes(setHours(subDays(date, 1), 22), 0), 0);
    const locked = isAfter(now, cutoff);

    if (myShifts[dateStr]) {
      setSelectedDate(date);
      setExistingShift(myShifts[dateStr]);
      setIsLocked(locked);
    } else {
      if (locked) {
        toast.error('该日期的排班已于前一日 22:00 锁定，无法新增排班。');
      } else {
        navigate(`/shift/${dateStr}`);
      }
    }
  };

  const handleReschedule = async () => {
    if (isLocked || !selectedDate || !user) return;
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const shiftDocId = `${dateStr}_${user.uid}`;
    
    try {
      const res = await fetch(`/api/shifts/${shiftDocId}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        let errMessage = 'Failed to delete shift';
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch (e) {}
        throw new Error(errMessage);
      }
      
      const localShifts = JSON.parse(localStorage.getItem('my_shifts') || '{}');
      delete localShifts[dateStr];
      localStorage.setItem('my_shifts', JSON.stringify(localShifts));
      
      setExistingShift(null);
      navigate(`/shift/${dateStr}`);
    } catch (error) {
      console.error('Error deleting shift:', error);
      toast.error('删除排班失败，请重试');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <header className="bg-blue-600 text-white p-4 pt-8 shadow-md flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CalendarIcon className="w-6 h-6" />
          排班助手
        </h1>
        <button 
          onClick={() => navigate('/user')}
          className="p-2 hover:bg-blue-700 rounded-full transition-colors"
        >
          <Users className="w-5 h-5" />
        </button>
      </header>
      
      <main className="flex-1 p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">选择排班日期</h2>
          <Calendar onSelect={handleDateSelect} shifts={myShifts} />
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-md font-medium text-gray-700 mb-3">排班说明</h3>
          <ul className="text-sm text-gray-500 space-y-2 list-disc pl-4">
            <li>仅可选择未来7天内的班次。</li>
            <li>灰色日期不可选择。</li>
            <li>点击高亮日期进入具体班次选择。</li>
            <li>次日排班将于前1日22:00锁定，锁定后无法更改。</li>
          </ul>
        </div>
        
        <div className="mt-8 text-center pb-4">
          <span className="text-[10px] text-gray-300/30 select-none cursor-default">✨ luna</span>
        </div>
      </main>

      {/* Bottom Sheet Modal */}
      {selectedDate && existingShift && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 transition-opacity">
          <div className="bg-white w-full h-[70vh] rounded-t-3xl p-5 flex flex-col animate-in slide-in-from-bottom-full duration-300">
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-800">我的排班</h2>
                <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <CalendarIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">排班日期</p>
                      <p className="text-sm text-gray-800 font-semibold">{format(selectedDate, 'yyyy年MM月dd日')}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">岗位</p>
                      <p className="text-sm text-gray-800 font-semibold">
                        {existingShift.roleName || ROLES.find(r => r.id === existingShift.roleId)?.name}
                        {existingShift.roleId === 'writer' && existingShift.subRoleId ? ` (${existingShift.subRoleId === 'online' ? '线上' : '线下'})` : ''}
                      </p>
                    </div>
                  </div>

                  {existingShift.roleId !== 'assistant' && existingShift.lineId && (
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-600 font-medium">条线</p>
                        <p className="text-sm text-gray-800 font-semibold">{existingShift.lineName || LINES.find(l => l.id === existingShift.lineId)?.name}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">班次</p>
                      <p className="text-sm text-gray-800 font-semibold">
                        {existingShift.shiftName || SHIFTS.find(s => s.id === existingShift.shiftId)?.name} ({SHIFTS.find(s => s.id === existingShift.shiftId)?.time})
                      </p>
                    </div>
                  </div>

                  {existingShift.shiftId === 'leave' && existingShift.leaveReason && (
                    <div className="flex items-start gap-3">
                      <div className="bg-red-100 p-2 rounded-lg text-red-600 mt-1">
                        <CalendarIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs text-red-600 font-medium">请假原因</p>
                        <p className="text-sm text-gray-800 font-medium mt-1">{existingShift.leaveReason}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Show other users working on this day */}
                {selectedDate && allShifts[format(selectedDate, 'yyyy-MM-dd')]?.filter(s => s.uid !== user?.uid).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      当日其他排班同事
                    </h3>
                    <div className="space-y-2">
                      {allShifts[format(selectedDate, 'yyyy-MM-dd')]
                        .filter(s => s.uid !== user?.uid)
                        .map((shift, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center">
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
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={handleReschedule}
                  disabled={isLocked}
                  className={cn(
                    "w-full py-3.5 rounded-xl font-semibold transition-all",
                    isLocked
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "text-blue-600 bg-blue-50 hover:bg-blue-100"
                  )}
                >
                  {isLocked ? '已过更改时间 (前一日22:00锁定)' : '重新排班'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
