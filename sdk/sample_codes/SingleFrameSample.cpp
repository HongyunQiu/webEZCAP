
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <pthread.h>
#include "../../src/qhyccd.h"





//#define OPENCV_SUPPORT

#define MAX_CAMERA_NUM	10

#ifdef OPENCV_SUPPORT
#include <X11/Xlib.h>
#include <opencv/cv.h>
#include <opencv/highgui.h>
#endif

int num = 0;

typedef struct qhyccdhandle
  {
    qhyccd_handle *camhandle;
    char id[32];
    unsigned char *ImgData;
    pthread_t rawhandle;
    int index;
  }
qhyccdhandle;


qhyccdhandle usb_handel[MAX_CAMERA_NUM];


void *pic_thread(void *arg)
{
  int ret;
  int t_start,t_end;
  int fps = 0;
  int found = 0;
  char win_name[20];
  unsigned int w,h,bpp,channels;
  int camtime = 10000,camgain = 0,camspeed = 2,cambinx = 1,cambiny = 1;
  qhyccdhandle *handle = (qhyccdhandle *)arg;
  memset(win_name,0x00,sizeof(win_name));
  //sprintf(win_name,"show%d",handle->index);



  ret = QHYCCD_ERROR;


  ret = GetQHYCCDSingleFrame(handle->camhandle,&w,&h,&bpp,
                             &channels,handle->ImgData);
  if(ret == QHYCCD_SUCCESS)
    {
      //printf("CAMERA NO %d|GetQHYCCDSingleFrame succeess! \n",handle->index);

#ifdef OPENCV_SUPPORT
      IplImage *image;
      cvNamedWindow(win_name,0);
      image = cvCreateImage(cvSize(w,h),bpp,channels);
      image->imageData = (char *)handle->ImgData;
      cvShowImage(win_name,image);

      cvWaitKey(0);
      cvReleaseImage(&image);
#endif

    }
  else
    {
      //printf("CAMERA NO %d|GetQHYCCDSingleFrame fail:%d\n",handle->index,ret);
    }




  delete(handle->ImgData);
}

int QHYCCDDinit()
{
  int i;
  int ret;

  for (i = 0;i < num;i ++)
    {
      if(usb_handel[i].camhandle)
        {
          CancelQHYCCDExposingAndReadout(usb_handel[i].camhandle);

          ret = CloseQHYCCD(usb_handel[i].camhandle);
          if(ret == QHYCCD_SUCCESS)
            {
              printf("CAMERA NO %d|Close QHYCCD success!\n",i);
            }
          else
            {
              printf("CAMERA NO %d|Close QHYCCD failed!\n",i);
              goto QHYCCDDinit_failure;
            }
        }

      ret = ReleaseQHYCCDResource();
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|Rlease SDK Resource  success!\n",i);
        }
      else
        {
          printf("CAMERA NO %d|Rlease SDK Resource  failed!\n",i);
          goto QHYCCDDinit_failure;
        }
    }

  return 0;

QHYCCDDinit_failure:
  printf("CAMERA NO %d|some fatal error happened\n",i);
  return 1;
}

int QHYCCDInit()
{
  int ret;

  ret = InitQHYCCDResource();
  if(ret == QHYCCD_SUCCESS)
    {
      printf("Init SDK success!\n");
    }
  else
    {
      printf("Init SDK failed!\n");
      goto QHYCCDInit_failure;
    }
  num = ScanQHYCCD();
  if(num > 0)
    {
      printf("Yes!Found QHYCCD,the num is %d \n",num);
    }
  else
    {
      printf("Not Found QHYCCD,please check the usblink or the power\n");
      goto QHYCCDInit_failure;
    }

  for(int i = 0;i < num;i++)
    {
      ret = GetQHYCCDId(i,usb_handel[i].id);
    }

  for(int i = 0;i < num;i++)
    {
      usb_handel[i].camhandle = OpenQHYCCD(usb_handel[i].id);
      usb_handel[i].index = i;
    }

  return 0;

QHYCCDInit_failure:
  printf("QHYCCDInit function|some fatal error happened\n");
  return -1;

}



int QHYCCDSet()
{
  int i;
  int ret;
  unsigned int w,h,bpp,channels;
  int cambinx = 1,cambiny = 1;


  for (i = 0;i < num;i ++)
    {

      ret = SetQHYCCDStreamMode(usb_handel[i].camhandle,0);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|SetQHYCCDStreamMode success!\n",i);
        }
      else
        {
          printf("CAMERA NO %d|SetQHYCCDStreamMode code:%d\n",i,ret);
          goto QHYCCDSet_failure;
        }

      ret = InitQHYCCD(usb_handel[i].camhandle);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|Init QHYCCD success!\n",i);
        }
      else
        {
          printf("CAMERA NO %d|Init QHYCCD fail code:%d\n",i,ret);
          goto QHYCCDSet_failure;
        }

      double chipw,chiph,pixelw,pixelh;
      ret = GetQHYCCDChipInfo(usb_handel[i].camhandle,&chipw,&chiph,&w,&h,
	  	&pixelw,&pixelh,&bpp);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|GetQHYCCDChipInfo success!\n",i);
          printf("CAMERA NO %d|CCD/CMOS chip information:\n",i);
          printf("CAMERA NO %d|Chip width %3f mm,Chip height %3f mm\n",i,chipw,chiph);
          printf("CAMERA NO %d|Chip pixel width %3f um,Chip pixel height %3f um\n",i,pixelw,pixelh);
          //        printf("Chip Max Resolution is %d x %d,depth is %d\n",w,h,bpp);
        }
      else
        {
          printf("CAMERA NO %d|GetQHYCCDChipInfo fail\n",i);
          goto QHYCCDSet_failure;
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CAM_COLOR);
      if(ret == BAYER_GB || ret == BAYER_GR || ret == BAYER_BG || ret == BAYER_RG)
        {
          printf("CAMERA NO %d|This is a Color Cam\n",i);
          printf("even this is a color camera, in Single Frame mode THE SDK ONLY SUPPORT RAW OUTPUT.So please do not set SetQHYCCDDebayerOnOff() to true;");
          //SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_WBR,20);
          //SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_WBG,20);
          //SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_WBB,20);
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CONTROL_USBTRAFFIC);
      if(ret == QHYCCD_SUCCESS)
        {
          ret = SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_USBTRAFFIC,30);
          if(ret != QHYCCD_SUCCESS)
            {
              printf("CAMERA NO %d|SetQHYCCDParam CONTROL_USBTRAFFIC failed\n",i);
              getchar();
              goto QHYCCDSet_failure;
            }
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CONTROL_GAIN);
      if(ret == QHYCCD_SUCCESS)
        {
          ret = SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_GAIN,30);
          if(ret != QHYCCD_SUCCESS)
            {
              printf("CAMERA NO %d|SetQHYCCDParam CONTROL_GAIN failed\n",i);
              getchar();
              goto QHYCCDSet_failure;
            }
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CONTROL_OFFSET);
      if(ret == QHYCCD_SUCCESS)
        {
          ret = SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_OFFSET,140);
          if(ret != QHYCCD_SUCCESS)
            {
              printf("CAMERA NO %d|SetQHYCCDParam CONTROL_GAIN failed\n",i);
              getchar();
              goto QHYCCDSet_failure;
            }
        }

      ret = SetQHYCCDParam(usb_handel[i].camhandle,CONTROL_EXPOSURE,20000);//170000000);
      if(ret != QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|SetQHYCCDParam CONTROL_EXPOSURE failed\n",i);
          getchar();
          goto QHYCCDSet_failure;
        }

      ret = SetQHYCCDResolution(usb_handel[i].camhandle,0,0,w,h);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|SetQHYCCDResolution success!\n",i);
        }
      else
        {
          printf("CAMERA NO %d|SetQHYCCDResolution fail\n",i);
          goto QHYCCDSet_failure;
        }

      ret = SetQHYCCDBinMode(usb_handel[i].camhandle,cambinx,cambiny);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("CAMERA NO %d|SetQHYCCDBinMode success!\n",i);
        }
      else
        {
          printf("CAMERA NO %d|SetQHYCCDBinMode fail\n",i);
          goto QHYCCDSet_failure;
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CONTROL_TRANSFERBIT);
      if(ret == QHYCCD_SUCCESS)
        {
          ret = SetQHYCCDBitsMode(usb_handel[i].camhandle,16);
          if(ret != QHYCCD_SUCCESS)
            {
              printf("CAMERA NO %d|SetQHYCCDParam CONTROL_GAIN failed\n",i);
              getchar();
              goto QHYCCDSet_failure;
            }
        }


      uint32_t length = GetQHYCCDMemLength(usb_handel[i].camhandle);

      if(length > 0)
        {
          usb_handel[i].ImgData = (unsigned char *)malloc(length);
          memset(usb_handel[i].ImgData,0,length);
        }
      else
        {
          printf("CAMERA NO %d|Get the min memory space length failure \n",i);
          goto QHYCCDSet_failure;
        }

      ret = ExpQHYCCDSingleFrame(usb_handel[i].camhandle);
      if( ret != QHYCCD_ERROR )
        {
          printf("CAMERA NO %d|ExpQHYCCDSingleFrame success!\n",i);
          if( ret != QHYCCD_READ_DIRECTLY )
            {
              sleep(3);
            }
        }
      else
        {
          printf("CAMERA NO %d|ExpQHYCCDSingleFrame fail\n",i);
          goto QHYCCDSet_failure;
        }
	  

      sleep(1);

    }

  return 0;

QHYCCDSet_failure:
  printf("QHYCCDSet function|some fatal error happened\n");	

  return -1;
}


int main(int argc,char *argv[])
{
  int ret;
  int i;

#ifdef OPENCV_SUPPORT
  XInitThreads();
#endif

  ret = QHYCCDInit();
  if(QHYCCD_SUCCESS == ret)
    {
      printf("Init QHYCCD success!\n");
    }
  else
    {
      goto MAIN_failure;
    }


  ret = QHYCCDSet();
  if(ret == QHYCCD_SUCCESS)
    {
      printf(" Set camear success!\n");
    }
  else
    {
      goto MAIN_failure;
    }

  for (i = 0;i < num;i ++)
    {
      pthread_create(&usb_handel[i].rawhandle, NULL, pic_thread, &usb_handel[i]);
      sleep(1);
    }

#ifdef OPENCV_SUPPORT
  while(1)
    {
      sleep(1);
    }
#endif

  sleep(10);

  return 0;

MAIN_failure:
  printf("main function|some fatal error happened\n");
  return 1;
}

