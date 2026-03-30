export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        
        {/* Header */}
        <div className="bg-[#1A3C5E] rounded-2xl p-4 mb-4 text-white">
          <p className="text-blue-300 text-sm">Boa noite,</p>
          <h1 className="text-xl font-semibold">Luiz — Admin</h1>
          <p className="text-blue-300 text-xs mt-1">27 mar 2026</p>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Total produtos</p>
            <p className="text-2xl font-semibold text-gray-800">147</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Pedir hoje</p>
            <p className="text-2xl font-semibold text-red-500">23</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Vencendo em 7d</p>
            <p className="text-2xl font-semibold text-orange-500">5</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Estoque OK</p>
            <p className="text-2xl font-semibold text-green-600">119</p>
          </div>
        </div>

        {/* Alertas */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Alertas urgentes
        </p>
        <div className="bg-red-50 rounded-xl p-3 mb-2 flex justify-between items-center">
          <span className="text-red-800 text-sm font-medium">Cumbuca 300ml</span>
          <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">Pedir 15</span>
        </div>
        <div className="bg-red-50 rounded-xl p-3 mb-2 flex justify-between items-center">
          <span className="text-red-800 text-sm font-medium">Cobertura Morango</span>
          <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">Pedir 3</span>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 mb-2 flex justify-between items-center">
          <span className="text-orange-800 text-sm font-medium">Mousse Limão</span>
          <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">Vence 2d</span>
        </div>

      </div>
    </main>
  )
}