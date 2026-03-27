import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LINES, ROLES } from '../lib/constants';
import { useAuth } from '../AuthContext';
import { LogIn } from 'lucide-react';
import { format } from 'date-fns';

export default function UserModal() {
  const { user, loading, signIn } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [enName, setEnName] = useState('');
  const [cnName, setCnName] = useState('');
  const [lineId, setLineId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [subRoleId, setSubRoleId] = useState('online');
  const [shiftType, setShiftType] = useState<'morning' | 'night' | 'mixed' | ''>('');
  const location = useLocation();

  useEffect(() => {
    const handleOpenModal = () => setIsOpen(true);
    window.addEventListener('open_user_modal', handleOpenModal);
    return () => window.removeEventListener('open_user_modal', handleOpenModal);
  }, []);

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      setIsOpen(true);
      return;
    }

    const userInfoStr = localStorage.getItem('user_info');
    if (!userInfoStr) {
      setIsOpen(true);
    } else {
      try {
        const userInfo = JSON.parse(userInfoStr);
        setEnName(userInfo.englishName || '');
        setCnName(userInfo.chineseName || '');
        
        let loadedLineId = userInfo.lineId || '';
        if (['ace', 'link', 'flow'].includes(loadedLineId)) {
          loadedLineId = 'ace_link_flow';
        }
        setLineId(loadedLineId);
        
        setRoleId(userInfo.roleId || '');
        setSubRoleId(userInfo.subRoleId || 'online');
        setShiftType(userInfo.shiftType || '');
        
        if (!userInfo.shiftType || !userInfo.roleId || (userInfo.roleId !== 'assistant' && !loadedLineId) || !userInfo.englishName || !userInfo.chineseName) {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      } catch (e) {
        setIsOpen(true);
      }
    }
  }, [location.pathname, user, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enName.trim() && cnName.trim() && (roleId === 'assistant' || lineId) && shiftType && roleId) {
      const newUserInfo = { 
        englishName: enName.trim(), 
        chineseName: cnName.trim(),
        lineId: roleId === 'assistant' ? undefined : lineId,
        roleId,
        subRoleId: roleId === 'writer' ? subRoleId : undefined,
        shiftType
      };
      
      localStorage.setItem('user_info', JSON.stringify(newUserInfo));
      window.dispatchEvent(new Event('user_info_updated'));
      setIsOpen(false);

      if (user) {
        try {
          // Sync user profile to backend
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: user.uid,
              ...newUserInfo
            })
          });
        } catch (error) {
          console.error("Failed to sync user info", error);
        }
      }
    }
  };

  if (!isOpen) return null;

  if (!user) {
    return (
      <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white w-[90%] max-w-sm rounded-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">欢迎使用排班助手</h2>
          <p className="text-gray-500 mb-8">请先登录以继续使用</p>
          <button
            onClick={signIn}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
          >
            使用 飞书 账号登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-[90%] max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">基本信息填写</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">首次进入排班助手，请完善您的信息</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">英文名</label>
              <input
                type="text"
                value={enName}
                onChange={(e) => setEnName(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">中文名</label>
              <input
                type="text"
                value={cnName}
                onChange={(e) => setCnName(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">岗位</label>
            <select
              value={roleId}
              onChange={(e) => {
                const newRole = e.target.value;
                setRoleId(newRole);
                if (newRole === 'assistant' && shiftType === 'mixed') {
                  setShiftType('');
                }
                if (newRole === 'writer' && !['avbu', 'non-avbu'].includes(lineId)) {
                  setLineId('');
                } else if (newRole !== 'writer' && lineId === 'non-avbu') {
                  setLineId('');
                }
              }}
              className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
              required
            >
              <option value="" disabled>请选择岗位</option>
              {ROLES.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          {roleId !== 'assistant' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">所属条线</label>
              <select
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
                required
              >
                <option value="" disabled>请选择条线</option>
                {LINES.filter(line => roleId === 'writer' ? ['avbu', 'non-avbu'].includes(line.id) : line.id !== 'non-avbu').map(line => (
                  <option key={line.id} value={line.id}>{line.name}</option>
                ))}
              </select>
            </div>
          )}

          {roleId === 'writer' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">办公方式</label>
              <select
                value={subRoleId}
                onChange={(e) => setSubRoleId(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
              >
                <option value="online">线上</option>
                <option value="offline">线下</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">偏好班次</label>
            <div className={`grid gap-2 ${roleId === 'assistant' ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button
                type="button"
                onClick={() => setShiftType('morning')}
                className={`p-2 rounded-xl border-2 text-center text-sm transition-all ${
                  shiftType === 'morning' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
                }`}
              >
                早班
              </button>
              <button
                type="button"
                onClick={() => setShiftType('night')}
                className={`p-2 rounded-xl border-2 text-center text-sm transition-all ${
                  shiftType === 'night' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
                }`}
              >
                晚班
              </button>
              {roleId !== 'assistant' && (
                <button
                  type="button"
                  onClick={() => setShiftType('mixed')}
                  className={`p-2 rounded-xl border-2 text-center text-sm transition-all ${
                    shiftType === 'mixed' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                      : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
                  }`}
                >
                  早晚混合
                </button>
              )}
            </div>
          </div>
          
          <button
            type="submit"
            disabled={!enName.trim() || !cnName.trim() || (roleId !== 'assistant' && !lineId) || !shiftType || !roleId}
            className="w-full py-3.5 mt-2 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98]"
          >
            确认提交
          </button>
        </form>
      </div>
    </div>
  );
}
