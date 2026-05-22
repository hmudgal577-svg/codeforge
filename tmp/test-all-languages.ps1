$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXA4cjVzaWUwMDAwdXN3NGJjZjd4bWNiIiwiZW1haWwiOiJ0ZXN0QGNvZGVmb3JnZS5kZXYiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc3OTEzMDQwMSwiZXhwIjoxNzc5MTMxMzAxfQ.7U0iGPiP6x1U6pWmsyFJgWA8SAJmZnnUKnB5k7r-AB4"
$wsId = "cmpbkb9qr0005us6kzky5rkw1"
$hdrs = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" }
$base = "http://localhost:4000/api/v1"

$tests = [ordered]@{
    "javascript" = 'console.log("Hello from JavaScript!");'
    "typescript" = 'const msg: string = "Hello from TypeScript!"; console.log(msg);'
    "python"     = 'print("Hello from Python!")'
    "java"       = 'public class Main { public static void main(String[] args) { System.out.println("Hello from Java!"); } }'
    "go"         = 'package main
import "fmt"
func main() { fmt.Println("Hello from Go!") }'
    "cpp"        = '#include <iostream>
int main() { std::cout << "Hello from C++!" << std::endl; return 0; }'
    "c"          = '#include <stdio.h>
int main() { printf("Hello from C!\n"); return 0; }'
    "dart"       = 'void main() { print("Hello from Dart!"); }'
    "ruby"       = 'puts "Hello from Ruby!"'
    "php"        = '<?php echo "Hello from PHP!\n"; ?>'
    "perl"       = 'print "Hello from Perl!\n";'
    "r"          = 'cat("Hello from R!\n")'
    "lua"        = 'print("Hello from Lua!")'
    "kotlin"     = 'fun main() { println("Hello from Kotlin!") }'
    "scala"      = 'object Main extends App { println("Hello from Scala!") }'
    "swift"      = 'print("Hello from Swift!")'
    "csharp"     = 'Console.WriteLine("Hello from C#!");'
    "rust"       = 'fn main() { println!("Hello from Rust!"); }'
    "powershell" = 'Write-Host "Hello from PowerShell!"'
    "bash"       = 'echo "Hello from Bash!"'
}

Write-Host ""
Write-Host "=========================================="
Write-Host "  CodeForge - All 20 Languages Test"
Write-Host "=========================================="
Write-Host ""

foreach ($lang in $tests.Keys) {
    $code = $tests[$lang]
    $body = @{ workspaceId=$wsId; language=$lang; code=$code } | ConvertTo-Json
    
    try {
        $submit = Invoke-RestMethod -Uri "$base/execution" -Method POST -Body $body -Headers $hdrs
        $jobId = $submit.data.jobId
        
        $status = "PENDING"
        $outText = ""
        $errText = ""
        for ($i = 0; $i -lt 35; $i++) {
            Start-Sleep -Milliseconds 800
            $res = Invoke-RestMethod -Uri "$base/execution/$jobId" -Method GET -Headers $hdrs
            $status = $res.data.status
            if ($status -in @("COMPLETED","FAILED","TIMEOUT")) {
                $outText = if ($res.data.output) { $res.data.output.Trim() } else { "" }
                $errText = if ($res.data.error) { $res.data.error.Trim() } else { "" }
                break
            }
        }
        
        $icon = if ($status -eq "COMPLETED") { "[PASS]" } elseif ($status -eq "FAILED") { "[FAIL]" } else { "[TIME]" }
        $display = if ($outText) { $outText.Split("`n")[0].Substring(0, [Math]::Min(60, $outText.Split("`n")[0].Length)) } elseif ($errText) { $errText.Split("`n")[0].Substring(0, [Math]::Min(80, $errText.Split("`n")[0].Length)) } else { "No output" }
        Write-Host "$icon $($lang.PadRight(12)) | $($status.PadRight(10)) | $display"
        
    } catch {
        $errMsg = $_.Exception.Message
        if ($errMsg.Length -gt 80) { $errMsg = $errMsg.Substring(0, 80) }
        Write-Host "[ERR]  $($lang.PadRight(12)) | API_ERROR  | $errMsg"
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "  Test Complete!"
Write-Host "=========================================="
