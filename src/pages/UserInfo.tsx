import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, UserCircle, Trash2, Pencil, LogOut, ShieldAlert, AlertCircle } from 'lucide-react';
import { LINES, ROLES } from '../lib/constants';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { isAfter, parseISO, subDays, setHours, setMinutes, setSeconds } from 'date-fns';

export default function UserInfo() {
  const navigate = useNavigate();
  const { user, logOut } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [userInfo, setUserInfo] = useState<{ englishName: string; chineseName: string; lineId?: string; shiftType?: string; roleId?: string; subRoleId?: string } | null>(() => {
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

  useEffect(() => {
    const loadUserInfo = () => {
      const storedUser = localStorage.getItem('user_info');
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (['ace', 'link', 'flow'].includes(parsed.lineId)) {
            parsed.lineId = 'ace_link_flow';
          }
          setUserInfo(parsed);
        } catch (e) {
          console.error("Failed to parse user info", e);
        }
      } else {
        setUserInfo(null);
      }
    };
    
    loadUserInfo();
    window.addEventListener('user_info_updated', loadUserInfo);
    
    return () => {
      window.removeEventListener('user_info_updated', loadUserInfo);
    };
  }, []);

  const handleClearInfo = () => {
    window.dispatchEvent(new Event('open_user_modal'));
  };

  const handleClearAll = async () => {
    setShowConfirm(true);
  };

  const confirmClearAll = async () => {
    setIsClearing(true);
    
    if (user?.uid) {
      try {
        const res = await fetch(`/api/shifts/user/${user.uid}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          throw new Error('Failed to delete on server');
        }
      } catch (e) {
        console.error('Failed to clear shifts on server', e);
        toast.error('清空云端数据失败，请重试');
        setIsClearing(false);
        setShowConfirm(false);
        return;
      }
    }
    
    const localShiftsStr = localStorage.getItem('my_shifts');
    if (localShiftsStr) {
      try {
        const localShifts = JSON.parse(localShiftsStr);
        const now = new Date();
        const newShifts: Record<string, any> = {};
        
        for (const [dateStr, shiftData] of Object.entries(localShifts)) {
          const [year, month, day] = dateStr.split('-').map(Number);
          const shiftDate = new Date(year, month - 1, day);
          const cutoff = setSeconds(setMinutes(setHours(subDays(shiftDate, 1), 22), 0), 0);
          
          if (isAfter(now, cutoff)) {
            // Locked, keep it
            newShifts[dateStr] = shiftData;
          }
        }
        localStorage.setItem('my_shifts', JSON.stringify(newShifts));
      } catch (e) {
        console.error('Failed to parse local shifts', e);
      }
    }
    
    toast.success('可编辑的排班数据已清空');
    setIsClearing(false);
    setShowConfirm(false);
    navigate('/');
  };

  const handleLogOut = async () => {
    await logOut();
    navigate('/');
  };

  const getShiftTypeName = (type?: string) => {
    if (type === 'morning') return '早班';
    if (type === 'night') return '晚班';
    if (type === 'mixed') return '早晚混合';
    return type;
  };

  const getRoleName = () => {
    if (!userInfo?.roleId) return '';
    let name = ROLES.find(r => r.id === userInfo.roleId)?.name || userInfo.roleId;
    if (userInfo.roleId === 'writer' && userInfo.subRoleId) {
      name += ` (${userInfo.subRoleId === 'online' ? '线上' : '线下'})`;
    }
    return name;
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
        <h1 className="text-lg font-bold ml-2">用户信息</h1>
      </header>

      <main className="flex-1 p-6 flex flex-col overflow-y-auto pb-10">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col items-center">
          <div className="bg-blue-50 p-4 rounded-full mb-2">
            <UserCircle className="w-16 h-16 text-blue-600" />
          </div>
          
          {userInfo ? (
            <div className="w-full space-y-4 mt-6">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">英文名 (English Name)</p>
                <p className="text-lg font-semibold text-gray-800">{userInfo.englishName}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">中文名 (Chinese Name)</p>
                <p className="text-lg font-semibold text-gray-800">{userInfo.chineseName}</p>
              </div>
              {userInfo.roleId && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">岗位</p>
                  <p className="text-lg font-semibold text-gray-800">{getRoleName()}</p>
                </div>
              )}
              {userInfo.lineId && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">所属条线</p>
                  <p className="text-lg font-semibold text-gray-800">{LINES.find(l => l.id === userInfo.lineId)?.name || userInfo.lineId}</p>
                </div>
              )}
              {userInfo.shiftType && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">偏好班次</p>
                  <p className="text-lg font-semibold text-gray-800">{getShiftTypeName(userInfo.shiftType)}</p>
                </div>
              )}
              {user && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">登录账号</p>
                  <p className="text-lg font-semibold text-gray-800">{user.email}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 mt-6">暂无用户信息</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleClearInfo}
            className="w-full py-3.5 rounded-xl font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
          >
            <Pencil className="w-5 h-5" />
            更新信息
          </button>

          <button
            onClick={handleClearAll}
            className="w-full py-3.5 rounded-xl font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            一键清空可编辑排班
          </button>

          <button
            onClick={handleLogOut}
            className="w-full py-3.5 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>

          <button
            onClick={() => navigate('/admin')}
            className="w-full py-3.5 rounded-xl font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <ShieldAlert className="w-5 h-5" />
            管理员设置
          </button>
        </div>

        <div className="mt-8 text-center pb-4">
          <span className="text-[10px] text-gray-300/30 select-none cursor-default">✨ luna</span>
        </div>
      </main>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">确认清空排班？</h3>
              <p className="text-center text-gray-600 mb-6">
                确定要清空您所有可编辑的排班数据吗？已锁定的历史排班将保留。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmClearAll}
                  disabled={isClearing}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isClearing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      清空中...
                    </>
                  ) : (
                    '确认清空'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
