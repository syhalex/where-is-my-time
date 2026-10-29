using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("WhereIsMyTime")]
[assembly: AssemblyProduct("WhereIsMyTime")]
[assembly: AssemblyDescription("WhereIsMyTime网页启动器")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class WhereIsMyTimeLauncher
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));

    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = Array.IndexOf(args, "--ensure-server") >= 0 || Array.IndexOf(args, "--check") >= 0;
        int port = 4173;
        foreach (string arg in args)
        {
            int requested;
            if (arg.StartsWith("--port=", StringComparison.Ordinal) && int.TryParse(arg.Substring(7), out requested) && requested > 0 && requested < 65536) port = requested;
        }
        string url = "http://127.0.0.1:" + port + "/";
        try
        {
            string server = Path.Combine(Root, "server.mjs");
            if (!File.Exists(server)) throw new InvalidOperationException("找不到网页文件，请保留WhereIsMyTime项目文件夹，再重新创建快捷方式。");
            string node = FindNode();
            if (node == null) throw new InvalidOperationException("未找到 Node.js，请先安装 Node.js，再打开WhereIsMyTime。");
            if (Array.IndexOf(args, "--check") >= 0) return 0;
            using (Mutex mutex = new Mutex(false, "Local\\WhereIsMyTimeLauncher" + port))
            {
                bool held = false;
                try
                {
                    try { held = mutex.WaitOne(15000); } catch (AbandonedMutexException) { held = true; }
                    if (!held) return 1;
                    if (!IsReady(url))
                    {
                        ProcessStartInfo info = new ProcessStartInfo(node, "\"" + server + "\"");
                        info.WorkingDirectory = Root;
                        info.UseShellExecute = false;
                        info.CreateNoWindow = true;
                        info.WindowStyle = ProcessWindowStyle.Hidden;
                        info.EnvironmentVariables["PORT"] = port.ToString();
                        using (Process process = Process.Start(info))
                        {
                            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server-" + port + ".pid"), process.Id.ToString());
                            bool ready = false;
                            for (int attempt = 0; attempt < 50; attempt++)
                            {
                                if (IsReady(url)) { ready = true; break; }
                                if (process.HasExited) break;
                                Thread.Sleep(150);
                            }
                            if (!ready) throw new InvalidOperationException("网页服务启动失败。端口 " + port + " 可能已被其他程序占用，请关闭占用程序后重试。");
                        }
                    }
                    if (!quiet) Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                }
                finally { if (held) mutex.ReleaseMutex(); }
            }
            return 0;
        }
        catch (Exception error)
        {
            if (!quiet) MessageBox.Show(error.Message, "WhereIsMyTime", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }

    private static string FindNode()
    {
        string known = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(known)) return known;
        foreach (string folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { string path = Path.Combine(folder.Trim().Trim('"'), "node.exe"); if (File.Exists(path)) return path; } catch { }
        }
        return null;
    }

    private static bool IsReady(string url)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Proxy = null;
            request.Timeout = 700;
            request.ReadWriteTimeout = 700;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                return response.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("<title>WhereIsMyTime");
        }
        catch { return false; }
    }
}

