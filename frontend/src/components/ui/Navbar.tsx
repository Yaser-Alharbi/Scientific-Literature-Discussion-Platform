'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePathname } from 'next/navigation';
const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Papers', href: '/papers' },
    { name: 'Streams', href: '/room' }
];

export default function Navbar() {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const router = useRouter();
    const { user, logout, isAuthenticated, token, isLoading } = useAuthStore();
    const pathname = usePathname();
    
    //  click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !(dropdownRef.current as HTMLElement).contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef]);

    const handleLogout = async () => {
        logout();
        router.push('/Login');
    };

    // show loading state while checking authentication
    if (isLoading) {
        return (
            <nav className="bg-gray-900/80 backdrop-blur-md shadow-md border-b border-gray-800/50 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex justify-between h-16 items-center">
                        <Link href="/" className="text-gray-200 font-medium">Home</Link>
                        <div className="animate-pulse bg-gray-700 h-4 w-20 rounded"></div>
                    </div>
                </div>
            </nav>
        );
    }
   
    if (!isAuthenticated || !user) {
        return (
            <nav className="bg-gray-900/80 backdrop-blur-md shadow-md border-b border-gray-800/50 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex justify-between h-16 items-center">
                        <Link href="/" className="text-gray-200 font-medium">Home</Link>
                        <div className="flex space-x-4">
                            <Link href="/Login" className="text-gray-200 hover:text-blue-300 transition-colors font-medium">Login</Link>
                            <Link href="/Signup" className="text-gray-200 hover:text-blue-300 transition-colors font-medium">Sign Up</Link>
                        </div>
                    </div>
                </div>
            </nav>
        );
    }
   
    return (
        <nav className="bg-gray-900/80 backdrop-blur-md shadow-md border-b border-gray-800/50 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex space-x-8">
                        {navigation.map((item) => (
                            <Link 
                                key={item.name} 
                                href={item.href}
                                className={`text-gray-300 hover:text-blue-300 transition-colors font-medium ${
                                    pathname === item.href ? 'text-blue-300 border-b-2 border-blue-400' : ''
                                }`}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setShowDropdown(!showDropdown)} 
                            className="text-gray-300 hover:text-blue-300 transition-colors font-medium flex items-center"
                        >
                            {user?.first_name + ' ' + user?.last_name}
                            <svg className="ml-1 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        {showDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-gray-900/90 backdrop-blur-md rounded-md shadow-lg border border-gray-800/50 z-10">
                                <Link href="/profile" className="block px-4 py-2 text-gray-300 hover:bg-gray-800/70 hover:text-blue-300 transition-colors">
                                    Profile
                                </Link>
                                <Link href="/extracts" className="block px-4 py-2 text-gray-300 hover:bg-gray-800/70 hover:text-blue-300 transition-colors">
                                    My Extracts
                                </Link>

                                <button 
                                    onClick={handleLogout} 
                                    className="block w-full text-left px-4 py-2 text-gray-300 hover:bg-gray-800/70 hover:text-red-300 transition-colors"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}