export interface ASTAnalysis {
    functions: FunctionInfo[];
    imports: ImportInfo[];
    classes: ClassInfo[];
    complexity: ComplexityReport;
    dependencies: DependencyGraph;
    vulnerabilities: VulnerabilityReport[];
    metrics: CodeMetrics;
}
export interface FunctionInfo {
    name: string;
    lineStart: number;
    lineEnd: number;
    params: string[];
    returnType?: string;
    isAsync: boolean;
    isRecursive: boolean;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    calls: string[];
}
export interface ImportInfo {
    module: string;
    names: string[];
    isLocal: boolean;
    lineNumber: number;
}
export interface ClassInfo {
    name: string;
    methods: FunctionInfo[];
    properties: string[];
    extends?: string;
    implements?: string[];
    lineStart: number;
    lineEnd: number;
}
export interface ComplexityReport {
    cyclomaticTotal: number;
    cognitiveTotal: number;
    maxNestingDepth: number;
    linesOfCode: number;
    linesOfComments: number;
    maintainabilityIndex: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
export interface DependencyGraph {
    nodes: Array<{
        id: string;
        type: 'function' | 'class' | 'module';
    }>;
    edges: Array<{
        from: string;
        to: string;
        type: 'calls' | 'imports' | 'extends';
    }>;
}
export interface VulnerabilityReport {
    type: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    message: string;
    lineNumber: number;
    suggestion: string;
}
export interface CodeMetrics {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    functionCount: number;
    classCount: number;
    importCount: number;
    avgFunctionLength: number;
    maxFunctionLength: number;
    duplicateBlocks: number;
}
/**
 * ASTAnalyzer — Semantic code understanding
 *
 * Performs:
 * - Function/class extraction with complexity scoring
 * - Import/dependency graph building
 * - Recursive complexity analysis (cyclomatic + cognitive)
 * - Security vulnerability pattern detection
 * - Dead code detection
 * - Architecture graph generation
 * - Runtime bottleneck prediction
 * - Memory allocation pattern analysis
 */
export declare class ASTAnalyzer {
    /**
     * Full analysis of a code file
     */
    analyze(code: string, language: string): ASTAnalysis;
    /**
     * Extract functions from code
     */
    private extractFunctions;
    /**
     * Extract imports
     */
    private extractImports;
    /**
     * Extract classes
     */
    private extractClasses;
    /**
     * Compute complexity metrics
     */
    private computeComplexity;
    /**
     * Build dependency graph
     */
    private buildDependencyGraph;
    /**
     * Detect security vulnerabilities
     */
    private detectVulnerabilities;
    /**
     * Generate enriched context for AI prompts
     */
    generateAIContext(analysis: ASTAnalysis): string;
    private getFunctionPatterns;
    private findBlockEnd;
    private extractParams;
    private extractFunctionCalls;
    private cyclomaticComplexity;
    private cognitiveComplexity;
    private computeMaxNesting;
    private computeMetrics;
    private isComment;
}
//# sourceMappingURL=ast-analyzer.d.ts.map