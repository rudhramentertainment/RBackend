import IdCardGen from './utils/idCardGenerator.js';
import path from 'path';

(async ()=>{
  const user = {
    _id: 'testuser123',
    fullName: 'MR. PRASHANT KANVINDE',
    role: 'HOD PHOTOGRAPHY & DESIGN',
    avatarUrl: path.join(process.cwd(), 'uploads', 'sample-avatar.jpg'), // place a sample file here
    employeeQrUrl: path.join(process.cwd(), 'uploads', 'sample-qr.png'),
  };
  const rel = await IdCardGen.generateAndSaveIdCard(user, { backgroundImagePath: path.join(process.cwd(),'assets','idcard','bg.png')});
  console.log('Result:', rel);
})();
