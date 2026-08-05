package com.indking;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringEscapeUtils;



public class RegTest
{
  public static boolean regExMatch(String RegExString, String String2Match) {
    String regx = StringEscapeUtils.unescapeJava(RegExString);
    return String2Match.matches(regx);
  }
  
  public static void regExReplace(String RegExString, String LookInString, String ReplaceWith, String path) throws IOException {
    byte[] returnResult = null;
    try {
      String regx = StringEscapeUtils.unescapeJava(RegExString);
      returnResult = LookInString.toString().replaceAll(regx, Matcher.quoteReplacement(ReplaceWith)).getBytes(StandardCharsets.UTF_8);
      FileUtils.writeByteArrayToFile(new File(path), returnResult);
    } catch (Exception e) {
      throw e;
    } 
  }



  
  public static void regExGetGrp(String RegExp, String string2Match, int groupindex, String path) throws Exception {
    byte[] returnResult = null;
    try {
      String regx = StringEscapeUtils.unescapeJava(RegExp);
      Pattern pattern = Pattern.compile(regx);
      Matcher matcher = pattern.matcher(string2Match);
      if (matcher.find()) {
        returnResult = matcher.group(groupindex).getBytes(StandardCharsets.UTF_8);
      }
      FileUtils.writeByteArrayToFile(new File(path), returnResult);
    } catch (Exception e) {
      throw e;
    } 
  }

  
  public static void regExSearch(String RegExString, String LookInString, String delimiter, String path) throws Exception {
    StringBuilder builder = new StringBuilder();
    byte[] returnResult = null;
    try {
      String regx = StringEscapeUtils.unescapeJava(RegExString);
      Pattern pattern = Pattern.compile(regx);
      Matcher matcher = pattern.matcher(LookInString);
      
      while (matcher.find()) {
        builder.append(String.valueOf(matcher.group()) + delimiter);
      }
      
      if (builder.toString().length() != 0) {
        returnResult = builder.toString().substring(0, builder.toString().length() - 1).getBytes(StandardCharsets.UTF_8);
      }
      FileUtils.writeByteArrayToFile(new File(path), returnResult);
    }
    catch (Exception e) {
      throw e;
    } 
  }
}