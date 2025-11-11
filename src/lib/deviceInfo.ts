// Utility to capture device information for audit logging

export interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  user_agent: string;
  browser_name: string;
  os_name: string;
}

export const getDeviceInfo = (): DeviceInfo => {
  const ua = navigator.userAgent;
  
  // Detect device type
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  const device_type = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
  
  // Detect browser
  let browser_name = 'Unknown';
  if (ua.includes('Firefox/')) {
    const version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || '';
    browser_name = `Firefox ${version}`;
  } else if (ua.includes('Edg/')) {
    const version = ua.match(/Edg\/(\d+\.\d+)/)?.[1] || '';
    browser_name = `Edge ${version}`;
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const version = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || '';
    browser_name = `Chrome ${version}`;
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const version = ua.match(/Version\/(\d+\.\d+)/)?.[1] || '';
    browser_name = `Safari ${version}`;
  } else if (ua.includes('MSIE') || ua.includes('Trident/')) {
    browser_name = 'Internet Explorer';
  }
  
  // Detect OS
  let os_name = 'Unknown';
  if (ua.includes('Windows NT 10.0')) os_name = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os_name = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.2')) os_name = 'Windows 8';
  else if (ua.includes('Windows NT 6.1')) os_name = 'Windows 7';
  else if (ua.includes('Windows')) os_name = 'Windows';
  else if (ua.includes('Mac OS X')) {
    const version = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
    os_name = `macOS ${version}`;
  } else if (ua.includes('Android')) {
    const version = ua.match(/Android (\d+\.\d+)/)?.[1] || '';
    os_name = `Android ${version}`;
  } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
    const version = ua.match(/OS (\d+_\d+)/)?.[1]?.replace('_', '.') || '';
    os_name = `iOS ${version}`;
  } else if (ua.includes('Linux')) os_name = 'Linux';
  
  return {
    device_type,
    user_agent: ua,
    browser_name,
    os_name,
  };
};

// Get IP address (will be fetched from a service or edge function)
export const getClientIP = async (): Promise<string | null> => {
  try {
    // Try to get IP from ipify service
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.error('Failed to fetch IP address:', error);
    return null;
  }
};
