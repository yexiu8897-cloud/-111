import React, { useState, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  isBefore,
  isAfter,
  startOfDay
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { SHIFTS } from '../lib/constants';

interface CalendarProps {
  onSelect: (date: Date) => void;
  shifts?: Record<string, any>;
}

export default function Calendar({ onSelect, shifts = {} }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const maxDate = addDays(tomorrow, 6); // Tomorrow + 6 days = 7 days total

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const onDateClick = (day: Date) => {
    if (isSelectable(day)) {
      onSelect(day);
    }
  };

  const isSelectable = (day: Date) => {
    const dayStart = startOfDay(day);
    return !isBefore(dayStart, tomorrow) && !isAfter(dayStart, maxDate);
  };

  const getShiftStyle = (shiftId?: string, isCurrentMonth: boolean = true) => {
    if (!isCurrentMonth) return "bg-gray-50 text-gray-300";
    
    switch (shiftId) {
      case 'morning1': // 10:00
        return "bg-[#A0B870] text-white shadow-md";
      case 'morning2': // 11:00
      case 'morning3': // 11:00
        return "bg-[#FFC323] text-white shadow-md";
      case 'night': // 14:00
        return "bg-[#60B5FF] text-white shadow-md";
      case 'leave': // 请假
        return "bg-[#D6283B] text-white shadow-md";
      case 'comp_leave': // 调休
        return "bg-[#B7B3E6] text-white shadow-md";
      default:
        return "bg-white text-gray-800";
    }
  };

  const getShiftTime = (shiftId?: string) => {
    if (!shiftId) return '';
    const shift = SHIFTS.find(s => s.id === shiftId);
    if (!shift) return '';
    if (shiftId === 'leave' || shiftId === 'comp_leave') return shift.name;
    return shift.time.split(' - ')[0]; // Get the start time
  };

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={prevMonth}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-lg font-semibold text-gray-800">
          {format(currentDate, 'yyyy年 MM月', { locale: zhCN })}
        </span>
        <button 
          onClick={nextMonth}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const date = ['日', '一', '二', '三', '四', '五', '六'];
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center font-medium text-sm text-gray-500 py-2">
          {date[i]}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2 gap-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Start on Sunday to match header
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dateStr = format(cloneDay, 'yyyy-MM-dd');
        const selectable = isSelectable(cloneDay);
        const isToday = isSameDay(cloneDay, today);
        const isCurrentMonth = isSameMonth(cloneDay, monthStart);
        const shift = shifts[dateStr];

        days.push(
          <div
            key={cloneDay.toString()}
            onClick={() => onDateClick(cloneDay)}
            className={cn(
              "relative flex flex-col items-center justify-center p-1 rounded-xl aspect-square transition-all",
              getShiftStyle(shift?.shiftId, isCurrentMonth),
              selectable 
                ? "cursor-pointer hover:opacity-80" 
                : "cursor-not-allowed opacity-50",
              isToday && "ring-2 ring-black ring-offset-1",
              selectable && !shift && "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
              !selectable && !shift && !isCurrentMonth && "bg-gray-50 text-gray-300",
              !selectable && !shift && isCurrentMonth && "bg-white text-gray-400"
            )}
          >
            <span className="text-sm font-semibold">{format(cloneDay, 'd')}</span>
            {shift && (
              <span className="text-[10px] leading-tight mt-0.5">{getShiftTime(shift.shiftId)}</span>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-2 mb-2" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  return (
    <div className="w-full">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
    </div>
  );
}
