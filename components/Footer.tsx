
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-100 py-10 md:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xs">A</div>
            <span className="font-bold text-gray-900 uppercase tracking-tighter">Assistify</span>
          </div>
          
          <div className="text-xs md:text-sm text-gray-500 text-center order-3 md:order-2">
            © {new Date().getFullYear()} Assistify Project. All rights reserved.
          </div>
          
          <div className="flex gap-6 text-xs md:text-sm text-gray-400 order-2 md:order-3">
            <a href="#" className="hover:text-blue-600 transition-colors">Twitter</a>
            <a href="#" className="hover:text-blue-600 transition-colors">GitHub</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
