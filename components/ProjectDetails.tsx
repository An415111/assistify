
import React from 'react';

const ProjectDetails: React.FC = () => {
  const features = [
    {
      title: "24/7 Automated Support",
      description: "Ensure your customers are never left waiting. Our AI handles queries instantly at any time of day.",
      icon: "🤖"
    },
    {
      title: "CRM Connectivity",
      description: "Seamlessly sync your Telegram conversations with top-tier CRM platforms to keep your data unified.",
      icon: "🔗"
    },
    {
      title: "Intelligent Customer Support",
      description: "Advanced natural language processing understands context and intent to provide human-like assistance.",
      icon: "🧠"
    }
  ];

  return (
    <section id="features" className="py-12 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 tracking-tight">Core Capabilities</h2>
          <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, idx) => (
            <div 
              key={idx} 
              className="group p-8 rounded-[2rem] bg-gray-50 border border-gray-100 transition-all duration-300 hover:bg-white hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-2"
            >
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3 tracking-tight">{feature.title}</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectDetails;
