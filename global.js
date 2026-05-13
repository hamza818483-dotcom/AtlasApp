// ============================================================
// global.js — EMERGENCY FIX for Admin Login
// This file ensures admin login works on mobile
// ============================================================

(function() {
    console.log('Global emergency script loaded');
    
    // Direct admin login handler
    window.adminLogin = function() {
        console.log('adminLogin called');
        
        const phone = document.getElementById('login-phone')?.value || '';
        const password = document.getElementById('login-pass')?.value || '';
        
        console.log('Phone:', phone);
        console.log('Password length:', password.length);
        
        if (phone === '01754365403' && password === 'AtlasApp2026') {
            const adminUser = {
                id: 'admin_' + Date.now(),
                name: 'Admin',
                phone: '01754365403',
                role: 'admin',
                loginTime: new Date().toISOString()
            };
            localStorage.setItem('atlas_user', JSON.stringify(adminUser));
            
            // Show admin button
            const adminBtn = document.getElementById('admin-control-btn');
            if (adminBtn) {
                adminBtn.style.display = 'block';
                console.log('Admin button shown');
            } else {
                console.log('Admin button not found');
            }
            
            alert('✅ Admin Login Successful!');
            
            // Navigate to home
            if (typeof window.navigateTo === 'function') {
                window.navigateTo('page-home');
            } else {
                window.location.hash = '#page-home';
            }
            return true;
        } else {
            alert('Wrong credentials!\n\nUse:\nPhone: 01754365403\nPassword: AtlasApp2026');
            return false;
        }
    };
    
    // Override the login button click
    document.addEventListener('DOMContentLoaded', function() {
        const loginBtn = document.querySelector('#page-login .btn-primary');
        if (loginBtn) {
            console.log('Login button found, attaching direct handler');
            // Remove existing onclick and add new one
            loginBtn.removeAttribute('onclick');
            loginBtn.onclick = function(e) {
                e.preventDefault();
                window.adminLogin();
                return false;
            };
        }
        
        // Check if already logged in as admin
        const user = localStorage.getItem('atlas_user');
        if (user) {
            try {
                const userData = JSON.parse(user);
                if (userData.phone === '01754365403') {
                    const adminBtn = document.getElementById('admin-control-btn');
                    if (adminBtn) adminBtn.style.display = 'block';
                }
            } catch(e) {}
        }
    });
})();
