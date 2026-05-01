
import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="relative pt-16 pb-12 lg:pt-32 lg:pb-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-gray-900 leading-tight mb-6">
            Elevate Your Business with <span className="text-blue-600">Telegram</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 lg:mb-10 leading-relaxed max-w-2xl mx-auto">
            Assistify is an intelligent business chatbot solution designed to automate customer support, sales, and lead generation directly within the Telegram ecosystem.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="#demo"
              className="w-full sm:w-auto px-10 py-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 text-lg"
            >
              View Live Demo
            </a>
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
      </div>
    </section>
  );
};

export default Hero;
