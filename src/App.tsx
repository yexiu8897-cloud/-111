/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import ShiftSelection from "./pages/ShiftSelection";
import UserInfo from "./pages/UserInfo";
import Admin from "./pages/Admin";
import UserModal from "./components/UserModal";
import { AuthProvider } from "./AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100 flex justify-center">
          <div className="w-full max-w-md bg-white shadow-xl min-h-screen relative overflow-hidden">
            <Toaster position="top-center" richColors />
            <UserModal />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shift/:date" element={<ShiftSelection />} />
              <Route path="/user" element={<UserInfo />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
