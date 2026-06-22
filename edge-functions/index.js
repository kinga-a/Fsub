export function onRequest(context) {
  return new Response(HTML_CONTENT, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>订阅管理中心</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5; 
            color: #1f2937;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        .login-overlay {
            position: fixed; inset: 0;
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
            transition: opacity 0.4s ease;
        }
        .login-box {
            background: white; padding: 48px 40px; border-radius: 20px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
            width: 90%; max-width: 420px;
            text-align: center;
        }
        .login-box .icon { font-size: 48px; margin-bottom: 16px; }
        .login-box h2 { font-size: 24px; margin-bottom: 8px; }
        .login-box p { color: #6b7280; margin-bottom: 32px; font-size: 15px; }
        .login-input {
            width: 100%; padding: 14px 18px; border: 2px solid #e5e7eb;
            border-radius: 12px; font-size: 16px; margin-bottom: 20px;
            transition: all 0.3s;
        }
        .login-input:focus { 
            outline: none; 
            border-color: #4f46e5; 
            box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }
        .login-btn {
            width: 100%; padding: 14px; background: #4f46e5;
            color: white; border: none; border-radius: 12px;
            font-size: 16px; font-weight: 600; cursor: pointer;
            transition: all 0.3s;
        }
        .login-btn:hover { background: #4338ca; }
        .error-msg { 
            color: #dc2626; 
            margin-top: 12px; 
            font-size: 14px; 
            display: none;
            padding: 8px 12px;
            background: #fef2f2;
            border-radius: 8px;
        }
        
        .app { display: none; }
        .header {
            background: white; padding: 24px; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 24px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .header h1 { font-size: 26px; font-weight: 700; }
        .header p { color: #6b7280; font-size: 14px; margin-top: 4px; }
        .logout-btn {
            padding: 10px 20px; border: 1px solid #e5e7eb;
            background: white; color: #4b5563; border-radius: 10px;
            cursor: pointer; font-size: 14px;
        }
        .logout-btn:hover { background: #f9fafb; }
        
        .stats {
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px; 
            margin-bottom: 28px;
        }
        .stat-card {
            background: white; padding: 24px; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .stat-card h3 { 
            font-size: 13px; 
            color: #6b7280; 
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        .stat-card .value { 
            font-size: 36px; 
            font-weight: 800; 
            line-height: 1;
        }
        .stat-card .value.active { color: #10b981; }
        .stat-card .value.soon { color: #f59e0b; }
        .stat-card .value.monthly { color: #4f46e5; }
        
        .toolbar {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 24px; gap: 16px;
        }
        .btn {
            padding: 12px 24px; border: none; border-radius: 12px;
            cursor: pointer; font-size: 14px; font-weight: 600;
            transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary { 
            background: #4f46e5; 
            color: white; 
        }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { background: white; color: #4b5563; border: 1px solid #e5e7eb; }
        
        .search-box {
            padding: 12px 18px; border: 1px solid #e5e7eb;
            border-radius: 12px; width: 320px; font-size: 14px;
        }
        
        .table-container {
            background: white; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 18px 20px; text-align: left; }
        th { 
            background: #f9fafb; 
            font-weight: 600; 
            color: #374151; 
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        tr { border-bottom: 1px solid #f3f4f6; }
        tr:hover { background: #fafafa; }
        .service-name { font-weight: 700; font-size: 15px; }
        .tag {
            padding: 5px 14px; border-radius: 20px; font-size: 12px;
            font-weight: 600; display: inline-block;
        }
        .tag-active { background: #d1fae5; color: #065f46; }
        .tag-expired { background: #fee2e2; color: #991b1b; }
        .tag-soon { background: #fef3c7; color: #92400e; }
        
        .price { font-weight: 700; font-size: 15px; }
        .cycle { color: #6b7280; font-size: 13px; }
        .note { color: #6b7280; font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .actions { display: flex; gap: 8px; }
        .icon-btn {
            width: 36px; height: 36px; border-radius: 10px;
            border: 1px solid #e5e7eb; background: white;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            font-size: 14px;
        }
        .icon-btn:hover { background: #f3f4f6; }
        
        .modal-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); 
            display: none;
            align-items: center; justify-content: center; 
            z-index: 100;
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: white; border-radius: 20px; width: 92%;
            max-width: 520px; max-height: 90vh; overflow-y: auto;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
        }
        .modal-header {
            padding: 28px; 
            border-bottom: 1px solid #f3f4f6;
            display: flex; justify-content: space-between; align-items: center;
        }
        .modal-body { padding: 28px; }
        .form-group { margin-bottom: 22px; }
        .form-group label {
            display: block; margin-bottom: 8px;
            font-weight: 600; color: #374151; font-size: 14px;
        }
        .form-group input, .form-group select {
            width: 100%; padding: 13px 16px; border: 1px solid #e5e7eb;
            border-radius: 12px; font-size: 15px;
        }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .modal-footer {
            padding: 24px 28px; 
            border-top: 1px solid #f3f4f6;
            display: flex
