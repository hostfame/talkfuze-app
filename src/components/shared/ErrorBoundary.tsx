import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary caught error in ${this.props.componentName || 'Component'}]:`, error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900/50 border border-red-100 dark:border-red-900/30 rounded-xl m-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle size={20} strokeWidth={2.5} />
          </div>
          <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-200 mb-1">
            Component Error
          </h3>
          <p className="text-[12px] text-slate-500 text-center mb-4 max-w-[250px]">
            Something went wrong while rendering this section.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[12px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors active:scale-95"
          >
            <RefreshCcw size={14} />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
